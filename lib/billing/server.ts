import 'server-only'

import type Stripe from 'stripe'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getGroupMagicImportStatus } from '@/lib/recipe-import/usage'
import type { ImportSourceType } from '@/lib/recipe-import/types'
import {
  getBillingGraceHours,
  getFreeMonthlyCredits,
  getProMonthlyCredits,
  getStripeMagicImportPriceId,
  getStripeMagicImportProductName,
  resolvePlanCodeForStripePrice,
} from './config'
import { isMagicImportOverrideUser } from './override'

type GroupRow = {
  id: string
  owner_id: string
}

type PlanRow = {
  id: string
  code: string
  monthly_credits: number
}

type SubscriptionLookupRow = {
  id: string
  provider_subscription_id: string | null
}

export type MagicImportEntitlementStatus = {
  allowed: boolean
  reasonCode: string | null
  planTier: string
  periodStart: string
  monthlyCredits: number
  usedCredits: number
  remainingCredits: number
  requiredCredits: number
  isUnlimited: boolean
  hasActiveSubscription: boolean
  graceActive: boolean
  isEnvOverride: boolean
}

function toOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function isLocalOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export function resolveBillingAppOrigin(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin
  const allowDevOverride = process.env.BILLING_APP_ORIGIN_ALLOW_DEV_OVERRIDE === 'true'
  const shouldPreferRequestOrigin = isLocalOrigin(requestOrigin) && !allowDevOverride

  const configuredOrigin = process.env.BILLING_APP_ORIGIN
  if (configuredOrigin && !shouldPreferRequestOrigin) {
    const parsedOrigin = toOrigin(configuredOrigin)
    if (!parsedOrigin) {
      throw new Error('BILLING_APP_ORIGIN must be a valid absolute URL.')
    }

    return parsedOrigin
  }

  return requestOrigin
}

export async function assertUserCanAccessGroup(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
) {
  const [{ data: ownerRow, error: ownerError }, { data: memberRow, error: memberError }] = await Promise.all([
    supabase.from('groups').select('id').eq('id', groupId).eq('owner_id', userId).maybeSingle(),
    supabase.from('group_members').select('group_id').eq('group_id', groupId).eq('user_id', userId).maybeSingle(),
  ])

  if (ownerError) throw ownerError
  if (memberError) throw memberError

  return Boolean(ownerRow || memberRow)
}

export async function assertUserCanManageGroupBilling(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<GroupRow | null> {
  const [{ data: group, error: groupError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from('groups').select('id, owner_id').eq('id', groupId).maybeSingle<GroupRow>(),
    supabase
      .from('group_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (groupError) throw groupError
  if (membershipError) throw membershipError
  if (!group) return null
  if (group.owner_id !== userId && !membership) return null

  return group
}

export async function getMagicImportEntitlementStatus(
  supabase: SupabaseClient,
  {
    groupId,
    sourceType,
    userId,
    userEmail,
  }: {
    groupId: string
    sourceType: ImportSourceType
    userId: string
    userEmail?: string | null
  },
): Promise<MagicImportEntitlementStatus> {
  const status = await getGroupMagicImportStatus(supabase, {
    groupId,
    sourceType,
  })

  const envOverride = isMagicImportOverrideUser({
    userId,
    email: userEmail,
  })

  const isUnlimited = envOverride || status.isUnlimited

  return {
    allowed: envOverride || status.allowed,
    reasonCode: envOverride ? null : status.reasonCode,
    planTier: envOverride ? 'override' : status.planTier,
    periodStart: status.periodStart,
    monthlyCredits: status.monthlyCredits,
    usedCredits: status.usedCredits,
    remainingCredits: status.remainingCredits,
    requiredCredits: isUnlimited ? 0 : status.requiredCredits,
    isUnlimited,
    hasActiveSubscription: status.hasActiveSubscription,
    graceActive: status.graceActive,
    isEnvOverride: envOverride,
  }
}

function shouldApplyGraceForSubscriptionStatus(subscriptionStatus: string) {
  return subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid'
}

function computeGraceUntil(currentPeriodEnd: number | null, subscriptionStatus: string) {
  if (!shouldApplyGraceForSubscriptionStatus(subscriptionStatus)) {
    return null
  }

  if (!currentPeriodEnd || currentPeriodEnd <= 0) {
    return null
  }

  const graceHours = getBillingGraceHours()
  const graceMs = graceHours * 60 * 60 * 1000
  return new Date(currentPeriodEnd * 1000 + graceMs).toISOString()
}

function shouldApplyPaidPlan(input: {
  planCode: string
  subscriptionStatus: string
  graceUntilIso: string | null
}) {
  if (input.planCode !== 'pro') {
    return false
  }

  if (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'trialing') {
    return true
  }

  if (!shouldApplyGraceForSubscriptionStatus(input.subscriptionStatus)) {
    return false
  }

  if (!input.graceUntilIso) {
    return false
  }

  const graceUntilMs = new Date(input.graceUntilIso).getTime()
  return Number.isFinite(graceUntilMs) && graceUntilMs > Date.now()
}

async function upsertPlanForCode(
  supabaseAdmin: SupabaseClient,
  {
    code,
    monthlyCredits,
    stripePriceId,
    name,
  }: {
    code: string
    monthlyCredits: number
    stripePriceId: string | null
    name: string
  },
): Promise<PlanRow> {
  const nowIso = new Date().toISOString()
  const upsertPayload = {
    code,
    name,
    stripe_price_id: stripePriceId,
    monthly_credits: monthlyCredits,
    active: true,
    metadata: {
      feature: 'magic_import',
    },
    updated_at: nowIso,
  }

  const { data, error } = await supabaseAdmin
    .from('plans')
    .upsert(upsertPayload, { onConflict: 'code' })
    .select('id, code, monthly_credits')
    .single<PlanRow>()

  if (error) {
    throw new Error(error.message || 'Unable to upsert billing plan.')
  }

  return data
}

async function syncCreditAccountForPlan(
  supabaseAdmin: SupabaseClient,
  {
    groupId,
    planTier,
    monthlyCredits,
    preserveCurrentPeriodAllocation,
  }: {
    groupId: string
    planTier: string
    monthlyCredits: number
    preserveCurrentPeriodAllocation: boolean
  },
) {
  const { error } = await supabaseAdmin.rpc('sync_group_import_account_for_plan', {
    p_group_id: groupId,
    p_plan_tier: planTier,
    p_monthly_credits: monthlyCredits,
    p_preserve_current_period_allocation: preserveCurrentPeriodAllocation,
  })

  if (error) {
    throw new Error(error.message || 'Unable to sync import credit account for billing plan.')
  }
}

export async function syncGroupSubscriptionFromStripe(
  supabaseAdmin: SupabaseClient,
  {
    subscription,
    groupId,
    webhookEventId,
    webhookReceivedAt,
  }: {
    subscription: Stripe.Subscription
    groupId: string
    webhookEventId?: string | null
    webhookReceivedAt?: string | null
  },
) {
  const currentPriceId = subscription.items.data[0]?.price?.id ?? null
  const currentPeriodStart = subscription.items.data[0]?.current_period_start ?? null
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end ?? null
  const inferredPlanCode = resolvePlanCodeForStripePrice(currentPriceId)
  const isPro = inferredPlanCode === 'pro'

  const plan = await upsertPlanForCode(supabaseAdmin, {
    code: inferredPlanCode,
    monthlyCredits: isPro ? getProMonthlyCredits() : getFreeMonthlyCredits(),
    stripePriceId: isPro ? currentPriceId : null,
    name: isPro ? getStripeMagicImportProductName() : 'Free',
  })

  const graceUntilIso = computeGraceUntil(currentPeriodEnd, subscription.status)

  const nowIso = new Date().toISOString()
  const { error: upsertSubscriptionError } = await supabaseAdmin.from('subscriptions').upsert(
    {
      group_id: groupId,
      plan_id: plan.id,
      provider: 'stripe',
      provider_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
      provider_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start:
        typeof currentPeriodStart === 'number'
          ? new Date(currentPeriodStart * 1000).toISOString()
          : null,
      current_period_end:
        typeof currentPeriodEnd === 'number'
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      grace_until: graceUntilIso,
      last_webhook_event_id: webhookEventId ?? null,
      last_webhook_received_at: webhookReceivedAt ?? nowIso,
      metadata: {
        latestStripeStatus: subscription.status,
      },
      updated_at: nowIso,
    },
    {
      onConflict: 'group_id,provider',
    },
  )

  if (upsertSubscriptionError) {
    throw new Error(upsertSubscriptionError.message || 'Unable to update subscription state.')
  }

  const applyPaidPlan = shouldApplyPaidPlan({
    planCode: inferredPlanCode,
    subscriptionStatus: subscription.status,
    graceUntilIso,
  })

  await syncCreditAccountForPlan(supabaseAdmin, {
    groupId,
    planTier: applyPaidPlan ? inferredPlanCode : 'free',
    monthlyCredits: applyPaidPlan ? plan.monthly_credits : getFreeMonthlyCredits(),
    preserveCurrentPeriodAllocation: applyPaidPlan,
  })
}

export async function syncGroupSubscriptionByLookup(
  supabaseAdmin: SupabaseClient,
  {
    stripe,
    groupId,
    webhookEventId,
    webhookReceivedAt,
  }: {
    stripe: Stripe
    groupId: string
    webhookEventId?: string | null
    webhookReceivedAt?: string | null
  },
) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id, provider_subscription_id')
    .eq('group_id', groupId)
    .eq('provider', 'stripe')
    .maybeSingle<SubscriptionLookupRow>()

  if (error) {
    throw new Error(error.message || 'Unable to load subscription lookup state.')
  }

  if (!data?.provider_subscription_id) {
    return false
  }

  const subscription = await stripe.subscriptions.retrieve(data.provider_subscription_id)

  await syncGroupSubscriptionFromStripe(supabaseAdmin, {
    subscription,
    groupId,
    webhookEventId,
    webhookReceivedAt,
  })

  return true
}

export function resolvePlanCodeFromCheckoutPrice(priceId: string | null | undefined) {
  const configuredPriceId = getStripeMagicImportPriceId()
  if (configuredPriceId && priceId && priceId === configuredPriceId) {
    return 'pro'
  }
  return 'free'
}
