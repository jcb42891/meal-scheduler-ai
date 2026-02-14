import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createSupabaseAdminClient } from '@/lib/billing/supabase-admin'
import { getStripeClient } from '@/lib/billing/stripe'
import { syncUserSubscriptionFromStripe } from '@/lib/billing/server'

export const runtime = 'nodejs'

type ExistingSubscriptionRow = {
  user_id: string
}

type WebhookProcessingStage =
  | 'signature_validation'
  | 'stripe_client_init'
  | 'read_payload'
  | 'construct_event'
  | 'route_event'
  | 'handle_checkout.session.completed'
  | 'handle_customer.subscription'
  | 'handle_invoice'
  | 'handle_invoice_payment.paid'
  | 'completed'

function getStripeResourceId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (!value || typeof value !== 'object') return null

  const maybeId = (value as { id?: unknown }).id
  if (typeof maybeId === 'string' && maybeId.trim()) return maybeId
  return null
}

async function lookupUserIdByStripeSubscriptionId(
  providerSubscriptionId: string,
): Promise<string | null> {
  const supabaseAdmin = createSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('provider_subscription_id', providerSubscriptionId)
    .eq('provider', 'stripe')
    .maybeSingle<ExistingSubscriptionRow>()

  if (error) {
    throw new Error(error.message || 'Unable to resolve subscription user mapping.')
  }

  return data?.user_id ?? null
}

async function lookupUserIdByStripeCustomerId(
  providerCustomerId: string,
): Promise<string | null> {
  const supabaseAdmin = createSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('provider_customer_id', providerCustomerId)
    .eq('provider', 'stripe')
    .maybeSingle<ExistingSubscriptionRow>()

  if (error) {
    throw new Error(error.message || 'Unable to resolve customer user mapping.')
  }

  return data?.user_id ?? null
}

async function handleCheckoutCompleted(event: Stripe.Event, stripe: Stripe) {
  const session = event.data.object as Stripe.Checkout.Session
  if (session.mode !== 'subscription') {
    return
  }

  let userId =
    (typeof session.client_reference_id === 'string' && session.client_reference_id) ||
    session.metadata?.user_id ||
    null

  const customerId = getStripeResourceId(session.customer)
  const subscriptionId = getStripeResourceId(session.subscription)
  if (!userId && customerId) {
    userId = await lookupUserIdByStripeCustomerId(customerId)
  }
  if (!userId) {
    return
  }

  const supabaseAdmin = createSupabaseAdminClient()

  const nowIso = new Date().toISOString()
  const { error: upsertError } = await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: userId,
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
      onConflict: 'user_id,provider',
    },
  )

  if (upsertError) {
    throw new Error(upsertError.message || 'Unable to store checkout completion state.')
  }

  if (!subscriptionId) {
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await syncUserSubscriptionFromStripe(supabaseAdmin, {
    subscription,
    userId,
    webhookEventId: event.id,
    webhookReceivedAt: nowIso,
  })
}

async function handleSubscriptionChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription

  const customerId = typeof subscription.customer === 'string' ? subscription.customer : null
  let userId: string | null = subscription.metadata?.user_id ?? null
  if (!userId) {
    userId = await lookupUserIdByStripeSubscriptionId(subscription.id)
  }
  if (!userId && customerId) {
    userId = await lookupUserIdByStripeCustomerId(customerId)
  }
  if (!userId) {
    return
  }

  const supabaseAdmin = createSupabaseAdminClient()
  await syncUserSubscriptionFromStripe(supabaseAdmin, {
    subscription,
    userId,
    webhookEventId: event.id,
    webhookReceivedAt: new Date().toISOString(),
  })
}

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice) {
  if (invoice.parent?.type === 'subscription_details') {
    const parentSubscriptionId = getStripeResourceId(invoice.parent.subscription_details?.subscription)
    if (parentSubscriptionId) return parentSubscriptionId
  }

  const legacySubscriptionId = getStripeResourceId((invoice as { subscription?: unknown }).subscription)
  if (legacySubscriptionId) {
    return legacySubscriptionId
  }

  for (const line of invoice.lines?.data ?? []) {
    if (line.parent?.type === 'subscription_item_details') {
      const lineSubscriptionId = getStripeResourceId(line.parent.subscription_item_details?.subscription)
      if (lineSubscriptionId) return lineSubscriptionId
    }
    if (line.parent?.type === 'invoice_item_details') {
      const lineSubscriptionId = getStripeResourceId(line.parent.invoice_item_details?.subscription)
      if (lineSubscriptionId) return lineSubscriptionId
    }
  }

  return null
}

async function syncFromSubscriptionId(
  subscriptionId: string,
  customerId: string | null,
  event: Stripe.Event,
  stripe: Stripe,
) {
  let userId = await lookupUserIdByStripeSubscriptionId(subscriptionId)
  if (!userId && customerId) {
    userId = await lookupUserIdByStripeCustomerId(customerId)
  }
  if (!userId) {
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const supabaseAdmin = createSupabaseAdminClient()
  await syncUserSubscriptionFromStripe(supabaseAdmin, {
    subscription,
    userId,
    webhookEventId: event.id,
    webhookReceivedAt: new Date().toISOString(),
  })
}

async function handleInvoiceChange(event: Stripe.Event, stripe: Stripe) {
  const invoice = event.data.object as Stripe.Invoice
  const subscriptionId = getSubscriptionIdFromInvoice(invoice)
  if (!subscriptionId) {
    return
  }

  await syncFromSubscriptionId(subscriptionId, getStripeResourceId(invoice.customer), event, stripe)
}

async function handleInvoicePaymentPaid(event: Stripe.Event, stripe: Stripe) {
  const invoicePayment = event.data.object as Stripe.InvoicePayment
  const invoiceRef = invoicePayment.invoice
  let invoice: Stripe.Invoice | null = null

  if (typeof invoiceRef === 'object' && invoiceRef && !('deleted' in invoiceRef)) {
    invoice = invoiceRef
  } else {
    const invoiceId = getStripeResourceId(invoiceRef)
    if (!invoiceId) {
      return
    }
    invoice = await stripe.invoices.retrieve(invoiceId)
  }

  const subscriptionId = getSubscriptionIdFromInvoice(invoice)
  if (!subscriptionId) {
    return
  }

  await syncFromSubscriptionId(subscriptionId, getStripeResourceId(invoice.customer), event, stripe)
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  let stage: WebhookProcessingStage = 'signature_validation'
  let eventId: string | null = null
  let eventType: string | null = null

  if (!signature || !webhookSecret) {
    console.warn('[billing-webhook] signature verification unavailable', {
      hasSignature: Boolean(signature),
      hasWebhookSecret: Boolean(webhookSecret),
      stage,
    })
    return NextResponse.json(
      {
        error: 'Webhook signature verification unavailable.',
        code: 'webhook_signature_verification_unavailable',
        stage,
      },
      { status: 400 },
    )
  }

  try {
    stage = 'stripe_client_init'
    const stripe = getStripeClient()
    stage = 'read_payload'
    const payload = await request.text()
    stage = 'construct_event'
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    eventId = event.id
    eventType = event.type

    stage = 'route_event'
    if (event.type === 'checkout.session.completed') {
      stage = 'handle_checkout.session.completed'
      await handleCheckoutCompleted(event, stripe)
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      stage = 'handle_customer.subscription'
      await handleSubscriptionChange(event)
    }

    if (
      event.type === 'invoice.payment_failed' ||
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'invoice.paid'
    ) {
      stage = 'handle_invoice'
      await handleInvoiceChange(event, stripe)
    }

    if (event.type === 'invoice_payment.paid') {
      stage = 'handle_invoice_payment.paid'
      await handleInvoicePaymentPaid(event, stripe)
    }

    stage = 'completed'
    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Webhook processing failed.'
    console.error('[billing-webhook] processing failed', {
      stage,
      eventId,
      eventType,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    })
    return NextResponse.json(
      {
        error: message,
        code: 'webhook_processing_failed',
        stage,
        eventId,
        eventType,
      },
      { status: 400 },
    )
  }
}
