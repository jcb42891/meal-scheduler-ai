import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn())
const getStripeClientMock = vi.hoisted(() => vi.fn())
const syncUserSubscriptionFromStripeMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/billing/supabase-admin', () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}))

vi.mock('@/lib/billing/stripe', () => ({
  getStripeClient: getStripeClientMock,
}))

vi.mock('@/lib/billing/server', () => ({
  syncUserSubscriptionFromStripe: syncUserSubscriptionFromStripeMock,
}))

type LookupState = {
  bySubscriptionId?: Record<string, string>
  byCustomerId?: Record<string, string>
}

function createSupabaseAdminMock(state: LookupState = {}) {
  const bySubscriptionId = state.bySubscriptionId ?? {}
  const byCustomerId = state.byCustomerId ?? {}
  const subscriptionsTable = {
    select: vi.fn().mockImplementation(() => {
      const filters: Record<string, string> = {}
      const query = {
        eq: vi.fn().mockImplementation((field: string, value: string) => {
          filters[field] = value
          return query
        }),
        maybeSingle: vi.fn().mockImplementation(async () => {
          if (filters.provider_subscription_id && bySubscriptionId[filters.provider_subscription_id]) {
            return {
              data: { user_id: bySubscriptionId[filters.provider_subscription_id] },
              error: null,
            }
          }

          if (filters.provider_customer_id && byCustomerId[filters.provider_customer_id]) {
            return {
              data: { user_id: byCustomerId[filters.provider_customer_id] },
              error: null,
            }
          }

          return { data: null, error: null }
        }),
      }

      return query
    }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'subscriptions') return subscriptionsTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function createStripeMock({
  event,
  invoiceById,
}: {
  event: unknown
  invoiceById?: Record<string, unknown>
}) {
  return {
    webhooks: {
      constructEvent: vi.fn().mockReturnValue(event),
    },
    subscriptions: {
      retrieve: vi.fn().mockImplementation(async (id: string) => ({
        id,
        status: 'active',
        customer: 'cus_123',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: 'price_pro' },
              current_period_start: 1_707_868_800,
              current_period_end: 1_710_547_200,
            },
          ],
        },
      })),
    },
    invoices: {
      retrieve: vi.fn().mockImplementation(async (id: string) => {
        const invoice = invoiceById?.[id]
        if (!invoice) {
          throw new Error(`Unknown invoice: ${id}`)
        }
        return invoice
      }),
    },
  }
}

function makeWebhookRequest({ includeSignature = true }: { includeSignature?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (includeSignature) {
    headers['stripe-signature'] = 't=1,v1=fake'
  }

  return new Request('http://localhost:3000/api/billing/webhook', {
    method: 'POST',
    headers,
    body: '{}',
  })
}

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseAdminMock())
    syncUserSubscriptionFromStripeMock.mockResolvedValue(undefined)
  })

  it('processes invoice.paid events using line-level subscription details', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      createSupabaseAdminMock({
        bySubscriptionId: { sub_line_123: 'user-1' },
      }),
    )
    const stripe = createStripeMock({
      event: {
        id: 'evt_invoice_paid',
        type: 'invoice.paid',
        data: {
          object: {
            customer: 'cus_123',
            parent: null,
            lines: {
              data: [
                {
                  parent: {
                    type: 'subscription_item_details',
                    subscription_item_details: {
                      subscription: 'sub_line_123',
                    },
                  },
                },
              ],
            },
          },
        },
      },
    })
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeWebhookRequest() as never)

    expect(response.status).toBe(200)
    expect(syncUserSubscriptionFromStripeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        webhookEventId: 'evt_invoice_paid',
      }),
    )
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_line_123')
  })

  it('processes invoice_payment.paid by resolving invoice then syncing subscription', async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      createSupabaseAdminMock({
        bySubscriptionId: { sub_invoice_payment: 'user-2' },
      }),
    )
    const stripe = createStripeMock({
      event: {
        id: 'evt_invoice_payment_paid',
        type: 'invoice_payment.paid',
        data: {
          object: {
            invoice: 'in_123',
          },
        },
      },
      invoiceById: {
        in_123: {
          customer: 'cus_123',
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: 'sub_invoice_payment',
            },
          },
          lines: { data: [] },
        },
      },
    })
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeWebhookRequest() as never)

    expect(response.status).toBe(200)
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith('in_123')
    expect(syncUserSubscriptionFromStripeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-2',
        webhookEventId: 'evt_invoice_payment_paid',
      }),
    )
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_invoice_payment')
  })

  it('accepts checkout.session.completed when customer and subscription IDs are expanded objects', async () => {
    const stripe = createStripeMock({
      event: {
        id: 'evt_checkout_complete',
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'subscription',
            client_reference_id: 'user-3',
            metadata: {},
            customer: { id: 'cus_object' },
            subscription: { id: 'sub_object' },
            id: 'cs_123',
          },
        },
      },
    })
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeWebhookRequest() as never)

    expect(response.status).toBe(200)
    expect(syncUserSubscriptionFromStripeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-3',
        webhookEventId: 'evt_checkout_complete',
      }),
    )
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_object')
  })

  it('returns diagnostic details when webhook signature verification is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stripe = createStripeMock({
      event: {
        id: 'evt_unused',
        type: 'checkout.session.completed',
        data: { object: {} },
      },
    })
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeWebhookRequest({ includeSignature: false }) as never)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      code: 'webhook_signature_verification_unavailable',
      stage: 'signature_validation',
    })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns diagnostic details when Stripe event construction fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getStripeClientMock.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('Invalid webhook signature')
        }),
      },
    })

    const { POST } = await import('./route')
    const response = await POST(makeWebhookRequest() as never)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: 'Invalid webhook signature',
      code: 'webhook_processing_failed',
      stage: 'construct_event',
      eventId: null,
      eventType: null,
    })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
