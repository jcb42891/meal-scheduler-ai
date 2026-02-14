import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn())
const getStripeClientMock = vi.hoisted(() => vi.fn())
const assertUserCanManageGroupBillingMock = vi.hoisted(() => vi.fn())
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
  assertUserCanManageGroupBilling: assertUserCanManageGroupBillingMock,
  resolveBillingAppOrigin: resolveBillingAppOriginMock,
}))

function createSupabaseMock(sessionUser: { id: string; email?: string | null } | null = { id: 'member-1', email: 'member@example.com' }) {
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

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/billing/portal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/billing/portal', () => {
  const body = {
    groupId: '11111111-1111-4111-8111-111111111111',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
    resolveBillingAppOriginMock.mockReturnValue('https://app.example.com')
    assertUserCanManageGroupBillingMock.mockResolvedValue({ id: body.groupId, owner_id: 'owner-1' })
  })

  it('returns 403 when user is not a group member', async () => {
    createRouteHandlerClientMock.mockReturnValue(createSupabaseMock())
    assertUserCanManageGroupBillingMock.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(makeRequest(body) as never)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'forbidden',
      error: 'You must be a member of this group to manage billing.',
    })
  })

  it('opens the portal for a group member', async () => {
    createRouteHandlerClientMock.mockReturnValue(createSupabaseMock({ id: 'member-2', email: 'member2@example.com' }))
    const { supabaseAdmin } = createSupabaseAdminMock('cus_abc')
    const stripe = createStripeMock()

    createSupabaseAdminClientMock.mockReturnValue(supabaseAdmin)
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeRequest(body) as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ url: 'https://stripe.example.com/portal' })
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_abc',
      return_url: 'https://app.example.com/meals',
    })
  })
})
