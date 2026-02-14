import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn())
const getStripeClientMock = vi.hoisted(() => vi.fn())
const getStripeMagicImportPriceIdMock = vi.hoisted(() => vi.fn())
const resolveBillingAppOriginMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/billing/supabase-admin', () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}))

vi.mock('@/lib/billing/stripe', () => ({
  getStripeClient: getStripeClientMock,
}))

vi.mock('@/lib/billing/config', () => ({
  getStripeMagicImportPriceId: getStripeMagicImportPriceIdMock,
}))

vi.mock('@/lib/billing/server', () => ({
  resolveBillingAppOrigin: resolveBillingAppOriginMock,
}))

function createSupabaseMock(
  sessionUser: { id: string; email?: string | null } | null = {
    id: 'member-1',
    email: 'member@example.com',
  },
) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: sessionUser ? { user: sessionUser } : null,
        },
        error: null,
      }),
    },
  }
}

function createSupabaseAdminMock(existingCustomerId: string | null = null) {
  const selectBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: existingCustomerId ? { provider_customer_id: existingCustomerId } : null,
      error: null,
    }),
  }

  const subscriptionsTable = {
    select: vi.fn().mockReturnValue(selectBuilder),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }

  const supabaseAdmin = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'subscriptions') return subscriptionsTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { supabaseAdmin, subscriptionsTable }
}

function createStripeMock() {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_new' }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://stripe.example.com/checkout' }),
      },
    },
  }
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
    getStripeMagicImportPriceIdMock.mockReturnValue('price_pro_123')
    resolveBillingAppOriginMock.mockReturnValue('https://app.example.com')
  })

  it('returns 401 when the user is not authenticated', async () => {
    createRouteHandlerClientMock.mockReturnValue(createSupabaseMock(null))

    const { POST } = await import('./route')
    const response = await POST(makeRequest() as never)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      code: 'unauthorized',
      error: 'Unauthorized',
    })
  })

  it('starts checkout and stores account-level billing state', async () => {
    createRouteHandlerClientMock.mockReturnValue(
      createSupabaseMock({ id: 'member-2', email: 'member2@example.com' }),
    )
    const { supabaseAdmin, subscriptionsTable } = createSupabaseAdminMock()
    const stripe = createStripeMock()

    createSupabaseAdminClientMock.mockReturnValue(supabaseAdmin)
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeRequest() as never)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ url: 'https://stripe.example.com/checkout' })
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'member2@example.com',
      metadata: {
        user_id: 'member-2',
        initiated_by_user_id: 'member-2',
      },
    })
    expect(subscriptionsTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'member-2',
        provider: 'stripe',
        provider_customer_id: 'cus_new',
      }),
      { onConflict: 'user_id,provider' },
    )
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: 'member-2',
        success_url: 'https://app.example.com/profile?tab=billing&billing=success',
        cancel_url: 'https://app.example.com/profile?tab=billing&billing=cancel',
        metadata: expect.objectContaining({
          user_id: 'member-2',
        }),
      }),
    )
  })

  it('reuses the existing customer id for the account', async () => {
    createRouteHandlerClientMock.mockReturnValue(
      createSupabaseMock({ id: 'member-2', email: 'member2@example.com' }),
    )
    const { supabaseAdmin } = createSupabaseAdminMock('cus_existing')
    const stripe = createStripeMock()

    createSupabaseAdminClientMock.mockReturnValue(supabaseAdmin)
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeRequest() as never)

    expect(response.status).toBe(200)
    expect(stripe.customers.create).not.toHaveBeenCalled()
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing',
      }),
    )
  })
})
