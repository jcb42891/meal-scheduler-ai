import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const assertUserCanAccessGroupMock = vi.hoisted(() => vi.fn())
const assertUserCanManageGroupBillingMock = vi.hoisted(() => vi.fn())
const getMagicImportEntitlementStatusMock = vi.hoisted(() => vi.fn())
const isStripeBillingConfiguredMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/billing/server', () => ({
  assertUserCanAccessGroup: assertUserCanAccessGroupMock,
  assertUserCanManageGroupBilling: assertUserCanManageGroupBillingMock,
  getMagicImportEntitlementStatus: getMagicImportEntitlementStatusMock,
}))

vi.mock('@/lib/billing/config', () => ({
  isStripeBillingConfigured: isStripeBillingConfiguredMock,
}))

function createSupabaseMock(sessionUser: { id: string; email?: string | null } | null = { id: 'user-1', email: 'user@example.com' }) {
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

function makeRequest(url: string) {
  return {
    nextUrl: new URL(url),
  } as never
}

describe('GET /api/billing/status', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
    assertUserCanAccessGroupMock.mockResolvedValue(true)
    assertUserCanManageGroupBillingMock.mockResolvedValue({ id: 'group-1', owner_id: 'user-1' })
    getMagicImportEntitlementStatusMock.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      planTier: 'free',
      periodStart: '2026-02-01',
      monthlyCredits: 40,
      usedCredits: 2,
      remainingCredits: 38,
      requiredCredits: 2,
      isUnlimited: false,
      hasActiveSubscription: false,
      graceActive: false,
      isEnvOverride: false,
    })
    isStripeBillingConfiguredMock.mockReturnValue(true)
  })

  it('returns 401 when no session exists', async () => {
    createRouteHandlerClientMock.mockReturnValue(createSupabaseMock(null))

    const { GET } = await import('./route')
    const response = await GET(makeRequest('http://localhost/api/billing/status?groupId=11111111-1111-4111-8111-111111111111&sourceType=url'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'unauthorized' })
  })

  it('returns 403 for inaccessible groups', async () => {
    createRouteHandlerClientMock.mockReturnValue(createSupabaseMock())
    assertUserCanAccessGroupMock.mockResolvedValue(false)

    const { GET } = await import('./route')
    const response = await GET(makeRequest('http://localhost/api/billing/status?groupId=11111111-1111-4111-8111-111111111111&sourceType=url'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'forbidden' })
  })

  it('returns entitlement status and billing flags', async () => {
    createRouteHandlerClientMock.mockReturnValue(createSupabaseMock())

    const { GET } = await import('./route')
    const response = await GET(makeRequest('http://localhost/api/billing/status?groupId=11111111-1111-4111-8111-111111111111&sourceType=image'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      planTier: 'free',
      requiredCredits: 2,
      sourceCosts: {
        text: 1,
        url: 2,
        image: 3,
      },
      billing: {
        stripeConfigured: true,
        canManage: true,
      },
    })
  })
})
