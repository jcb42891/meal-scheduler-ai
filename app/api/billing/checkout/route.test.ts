import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn())
const getStripeClientMock = vi.hoisted(() => vi.fn())
const getStripeMagicImportPriceIdMock = vi.hoisted(() => vi.fn())
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

vi.mock('@/lib/billing/config', () => ({
  getStripeMagicImportPriceId: getStripeMagicImportPriceIdMock,
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

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/billing/checkout', () => {
  const body = {
    groupId: '11111111-1111-4111-8111-111111111111',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
    getStripeMagicImportPriceIdMock.mockReturnValue('price_pro_123')
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

  it('starts checkout for a group member', async () => {
    createRouteHandlerClientMock.mockReturnValue(createSupabaseMock({ id: 'member-2', email: 'member2@example.com' }))
    const { supabaseAdmin, subscriptionsTable } = createSupabaseAdminMock()
    const stripe = createStripeMock()

    createSupabaseAdminClientMock.mockReturnValue(supabaseAdmin)
    getStripeClientMock.mockReturnValue(stripe)

    const { POST } = await import('./route')
    const response = await POST(makeRequest(body) as never)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ url: 'https://stripe.example.com/checkout' })
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'member2@example.com',
      metadata: {
        group_id: body.groupId,
        initiated_by_user_id: 'member-2',
      },
    })
    expect(subscriptionsTable.upsert).toHaveBeenCalled()
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: body.groupId,
        success_url: 'https://app.example.com/meals?billing=success',
        cancel_url: 'https://app.example.com/meals?billing=cancel',
        metadata: expect.objectContaining({
          group_id: body.groupId,
          user_id: 'member-2',
        }),
      }),
    )
  })
})
