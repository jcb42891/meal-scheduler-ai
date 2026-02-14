import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/billing/supabase-admin'
import { getStripeClient } from '@/lib/billing/stripe'
import { assertUserCanManageGroupBilling, resolveBillingAppOrigin } from '@/lib/billing/server'

export const runtime = 'nodejs'

const requestSchema = z.object({
  groupId: z.string().uuid(),
})

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

type ExistingSubscriptionRow = {
  provider_customer_id: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json())

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

    const group = await assertUserCanManageGroupBilling(supabase, body.groupId, session.user.id)
    if (!group) {
      return NextResponse.json(
        {
          error: 'You must be a member of this group to manage billing.',
          code: 'forbidden',
        },
        { status: 403 },
      )
    }

    const supabaseAdmin = createSupabaseAdminClient()
    const { data: subscription, error: subscriptionLookupError } = await supabaseAdmin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('group_id', body.groupId)
      .eq('provider', 'stripe')
      .maybeSingle<ExistingSubscriptionRow>()

    if (subscriptionLookupError) {
      throw new Error(subscriptionLookupError.message || 'Unable to load billing customer state.')
    }

    const customerId = subscription?.provider_customer_id?.trim() ?? ''
    if (!customerId) {
      return NextResponse.json(
        {
          error: 'No Stripe billing profile exists for this group yet.',
          code: 'billing_profile_missing',
        },
        { status: 409 },
      )
    }

    const stripe = getStripeClient()
    const appOrigin = resolveBillingAppOrigin(request)
    const sessionResult = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appOrigin}/meals`,
    })

    return NextResponse.json({ url: sessionResult.url })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request payload.',
          code: 'invalid_payload',
          details: error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      )
    }

    const message = error instanceof Error && error.message ? error.message : 'Unable to open customer portal.'
    return NextResponse.json({ error: message, code: 'server_error' }, { status: 500 })
  }
}
