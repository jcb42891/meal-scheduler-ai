import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/billing/supabase-admin'
import { getStripeClient } from '@/lib/billing/stripe'
import { getStripeMagicImportPriceId } from '@/lib/billing/config'
import { resolveBillingAppOrigin } from '@/lib/billing/server'

export const runtime = 'nodejs'

const requestSchema = z.object({}).passthrough()

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

type ExistingSubscriptionRow = {
  provider_customer_id: string | null
}

export async function POST(request: NextRequest) {
  try {
    await requestSchema.parse(await request.json().catch(() => ({})))
    const stripePriceId = getStripeMagicImportPriceId()

    if (!stripePriceId) {
      return NextResponse.json(
        {
          error: 'Stripe checkout is not configured.',
          code: 'billing_not_configured',
        },
        { status: 503 },
      )
    }

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

    const supabaseAdmin = createSupabaseAdminClient()
    const stripe = getStripeClient()

    const { data: existingSubscription, error: subscriptionLookupError } = await supabaseAdmin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('user_id', session.user.id)
      .eq('provider', 'stripe')
      .maybeSingle<ExistingSubscriptionRow>()

    if (subscriptionLookupError) {
      throw new Error(subscriptionLookupError.message || 'Unable to look up billing customer state.')
    }

    const customerId = existingSubscription?.provider_customer_id?.trim()
      ? existingSubscription.provider_customer_id
      : (
          await stripe.customers.create({
            email: session.user.email ?? undefined,
            metadata: {
              user_id: session.user.id,
              initiated_by_user_id: session.user.id,
            },
          })
        ).id

    const nowIso = new Date().toISOString()
    const { error: upsertError } = await supabaseAdmin.from('subscriptions').upsert(
      {
        user_id: session.user.id,
        provider: 'stripe',
        provider_customer_id: customerId,
        status: 'inactive',
        metadata: {
          checkoutInitiatedBy: session.user.id,
        },
        updated_at: nowIso,
      },
      {
        onConflict: 'user_id,provider',
      },
    )

    if (upsertError) {
      throw new Error(upsertError.message || 'Unable to persist billing customer state.')
    }

    const appOrigin = resolveBillingAppOrigin(request)
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${appOrigin}/profile?tab=billing&billing=success`,
      cancel_url: `${appOrigin}/profile?tab=billing&billing=cancel`,
      client_reference_id: session.user.id,
      metadata: {
        user_id: session.user.id,
        feature_key: 'magic_import',
      },
      allow_promotion_codes: true,
    })

    if (!checkoutSession.url) {
      throw new Error('Stripe checkout did not return a redirect URL.')
    }

    return NextResponse.json({ url: checkoutSession.url })
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

    const message = error instanceof Error && error.message ? error.message : 'Unable to start checkout session.'
    return NextResponse.json({ error: message, code: 'server_error' }, { status: 500 })
  }
}
