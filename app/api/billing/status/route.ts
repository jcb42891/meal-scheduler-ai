import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { isStripeBillingConfigured } from '@/lib/billing/config'
import {
  assertUserCanAccessGroup,
  assertUserCanManageGroupBilling,
  getMagicImportEntitlementStatus,
} from '@/lib/billing/server'
import { getSourceCreditCost } from '@/lib/recipe-import/usage'
import { importSourceTypeSchema } from '@/lib/recipe-import/schema'

export const runtime = 'nodejs'

const requestSchema = z.object({
  groupId: z.string().uuid(),
  sourceType: importSourceTypeSchema.default('url'),
})

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

export async function GET(request: NextRequest) {
  try {
    const parsed = requestSchema.parse({
      groupId: request.nextUrl.searchParams.get('groupId'),
      sourceType: request.nextUrl.searchParams.get('sourceType') ?? 'url',
    })

    const cookieStore = await cookies()
    const compatibleCookieGetter = (() => cookieStore) as unknown as RouteCookiesGetter
    const supabase = createRouteHandlerClient({
      cookies: compatibleCookieGetter,
    })

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) throw sessionError
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    }

    const hasAccess = await assertUserCanAccessGroup(supabase, parsed.groupId, session.user.id)
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: 'Forbidden: you do not have access to this group.',
          code: 'forbidden',
        },
        { status: 403 },
      )
    }

    const canManage = Boolean(await assertUserCanManageGroupBilling(supabase, parsed.groupId, session.user.id))
    const entitlement = await getMagicImportEntitlementStatus(supabase, {
      groupId: parsed.groupId,
      sourceType: parsed.sourceType,
      userId: session.user.id,
      userEmail: session.user.email,
    })

    return NextResponse.json({
      planTier: entitlement.planTier,
      allowed: entitlement.allowed,
      reasonCode: entitlement.reasonCode,
      periodStart: entitlement.periodStart,
      monthlyCredits: entitlement.monthlyCredits,
      usedCredits: entitlement.usedCredits,
      remainingCredits: entitlement.remainingCredits,
      requiredCredits: entitlement.requiredCredits,
      isUnlimited: entitlement.isUnlimited,
      hasActiveSubscription: entitlement.hasActiveSubscription,
      graceActive: entitlement.graceActive,
      isEnvOverride: entitlement.isEnvOverride,
      sourceCosts: {
        text: getSourceCreditCost('text'),
        url: getSourceCreditCost('url'),
        image: getSourceCreditCost('image'),
      },
      billing: {
        stripeConfigured: isStripeBillingConfigured(),
        canManage,
      },
    })
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid request payload.',
        code: 'invalid_payload',
      },
      { status: 400 },
    )
  }
}
