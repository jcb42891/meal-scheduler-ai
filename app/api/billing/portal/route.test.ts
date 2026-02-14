import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn())
const getStripeClientMock = vi.hoisted(() => vi.fn())
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

function createSupabaseAdminMock(customerId: string | null = 'cus_123') {
  const selectBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: customerId ? { provider_customer_id: customerId } : null,
      error: null,
    }),
  }

  const subscriptionsTable = {
    select: vi.fn().mockReturnValue(selectBuilder),
  }

  const supabaseAdmin = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'subscriptions') return subscriptionsTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { supabaseAdmin }
}

function createStripeMock() {
  return {
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://stripe.example.com/portal' }),
      },
    },
  }
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/billing/portal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
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

  it('opens the customer portal for the signed-in account', async () => {
    createRouteHandlerClientMock.mockReturnValue(
      createSupabaseMock({ id: 'member-2', email: 'member2@example.com' }),
    )
    const { supabaseAdmin } = createSupabaseAdminMock('cus_abc')
    const stripe = createStripeMock()

    createSupabaseAdminClientMock.mockReturnValue(supabaseAdmin)
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeRequest() as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ url: 'https://stripe.example.com/portal' })
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_abc',
      return_url: 'https://app.example.com/profile?tab=billing',
    })
  })

  it('returns 409 when no customer profile exists yet', async () => {
    createRouteHandlerClientMock.mockReturnValue(
      createSupabaseMock({ id: 'member-2', email: 'member2@example.com' }),
    )
    const { supabaseAdmin } = createSupabaseAdminMock(null)

    createSupabaseAdminClientMock.mockReturnValue(supabaseAdmin)
    getStripeClientMock.mockReturnValue(createStripeMock())

    const { POST } = await import('./route')
    const response = await POST(makeRequest() as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'billing_profile_missing',
      error: 'No Stripe billing profile exists for this account yet.',
    })
  })
})
