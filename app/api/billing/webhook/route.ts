import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createSupabaseAdminClient } from '@/lib/billing/supabase-admin'
import { getStripeClient } from '@/lib/billing/stripe'
import { syncGroupSubscriptionFromStripe } from '@/lib/billing/server'

export const runtime = 'nodejs'

type ExistingSubscriptionRow = {
  group_id: string
}

async function lookupGroupIdByStripeSubscriptionId(
  providerSubscriptionId: string,
): Promise<string | null> {
  const supabaseAdmin = createSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('group_id')
    .eq('provider_subscription_id', providerSubscriptionId)
    .eq('provider', 'stripe')
    .maybeSingle<ExistingSubscriptionRow>()

  if (error) {
    throw new Error(error.message || 'Unable to resolve subscription group mapping.')
  }

  return data?.group_id ?? null
}

async function handleCheckoutCompleted(event: Stripe.Event, stripe: Stripe) {
  const session = event.data.object as Stripe.Checkout.Session
  if (session.mode !== 'subscription') {
    return
  }

  const groupId =
    (typeof session.client_reference_id === 'string' && session.client_reference_id) ||
    session.metadata?.group_id ||
    null

  if (!groupId) {
    return
  }

  const customerId = typeof session.customer === 'string' ? session.customer : null
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null
  const supabaseAdmin = createSupabaseAdminClient()

  const nowIso = new Date().toISOString()
  const { error: upsertError } = await supabaseAdmin.from('subscriptions').upsert(
    {
      group_id: groupId,
      provider: 'stripe',
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
      status: 'inactive',
      last_webhook_event_id: event.id,
      last_webhook_received_at: nowIso,
      metadata: {
        checkoutSessionId: session.id,
      },
      updated_at: nowIso,
    },
    {
      onConflict: 'group_id,provider',
    },
  )

  if (upsertError) {
    throw new Error(upsertError.message || 'Unable to store checkout completion state.')
  }

  if (!subscriptionId) {
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await syncGroupSubscriptionFromStripe(supabaseAdmin, {
    subscription,
    groupId,
    webhookEventId: event.id,
    webhookReceivedAt: nowIso,
  })
}

async function handleSubscriptionChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription

  let groupId: string | null = subscription.metadata?.group_id ?? null
  if (!groupId) {
    groupId = await lookupGroupIdByStripeSubscriptionId(subscription.id)
  }

  if (!groupId) {
    return
  }

  const supabaseAdmin = createSupabaseAdminClient()
  await syncGroupSubscriptionFromStripe(supabaseAdmin, {
    subscription,
    groupId,
    webhookEventId: event.id,
    webhookReceivedAt: new Date().toISOString(),
  })
}

async function handleInvoiceChange(event: Stripe.Event, stripe: Stripe) {
  const invoice = event.data.object as Stripe.Invoice
  let subscriptionId: string | null = null
  if (invoice.parent?.type === 'subscription_details') {
    const rawSubscription = invoice.parent.subscription_details?.subscription
    subscriptionId =
      typeof rawSubscription === 'string'
        ? rawSubscription
        : rawSubscription && typeof rawSubscription.id === 'string'
          ? rawSubscription.id
          : null
  }

  if (!subscriptionId) {
    return
  }

  const groupId = await lookupGroupIdByStripeSubscriptionId(subscriptionId)
  if (!groupId) {
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const supabaseAdmin = createSupabaseAdminClient()
  await syncGroupSubscriptionFromStripe(supabaseAdmin, {
    subscription,
    groupId,
    webhookEventId: event.id,
    webhookReceivedAt: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook signature verification unavailable.' }, { status: 400 })
  }

  try {
    const stripe = getStripeClient()
    const payload = await request.text()
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)

    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event, stripe)
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await handleSubscriptionChange(event)
    }

    if (event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_succeeded') {
      await handleInvoiceChange(event, stripe)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Webhook processing failed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
