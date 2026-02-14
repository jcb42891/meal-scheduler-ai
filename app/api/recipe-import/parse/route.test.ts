import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const checkRecipeImportRateLimitMock = vi.hoisted(() => vi.fn())
const recordImportUsageEventMock = vi.hoisted(() => vi.fn())
const consumeUserImportCreditsMock = vi.hoisted(() => vi.fn())
const fetchRecipeTextFromUrlMock = vi.hoisted(() => vi.fn())
const parseRecipeWithOpenAIMock = vi.hoisted(() => vi.fn())
const parseRecipeFromPlainTextFallbackMock = vi.hoisted(() => vi.fn())
const normalizeParsedRecipeMock = vi.hoisted(() => vi.fn())
const assertUserCanAccessGroupMock = vi.hoisted(() => vi.fn())
const getMagicImportEntitlementStatusMock = vi.hoisted(() => vi.fn())
const syncUserSubscriptionByLookupMock = vi.hoisted(() => vi.fn())
const isStripeBillingConfiguredMock = vi.hoisted(() => vi.fn())
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn())
const getStripeClientMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/recipe-import/rate-limit', () => ({
  checkRecipeImportRateLimit: checkRecipeImportRateLimitMock,
}))

vi.mock('@/lib/recipe-import/usage', () => ({
  recordImportUsageEvent: recordImportUsageEventMock,
  consumeUserImportCredits: consumeUserImportCreditsMock,
}))

vi.mock('@/lib/recipe-import/url', () => ({
  fetchRecipeTextFromUrl: fetchRecipeTextFromUrlMock,
}))

vi.mock('@/lib/recipe-import/openai', () => ({
  parseRecipeWithOpenAI: parseRecipeWithOpenAIMock,
}))

vi.mock('@/lib/recipe-import/fallback', () => ({
  parseRecipeFromPlainTextFallback: parseRecipeFromPlainTextFallbackMock,
}))

vi.mock('@/lib/recipe-import/normalize', () => ({
  normalizeParsedRecipe: normalizeParsedRecipeMock,
}))

vi.mock('@/lib/billing/server', () => ({
  assertUserCanAccessGroup: assertUserCanAccessGroupMock,
  getMagicImportEntitlementStatus: getMagicImportEntitlementStatusMock,
  syncUserSubscriptionByLookup: syncUserSubscriptionByLookupMock,
}))

vi.mock('@/lib/billing/config', () => ({
  isStripeBillingConfigured: isStripeBillingConfiguredMock,
}))

vi.mock('@/lib/billing/supabase-admin', () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}))

vi.mock('@/lib/billing/stripe', () => ({
  getStripeClient: getStripeClientMock,
}))

type SupabaseOptions = {
  sessionUser?: { id: string; email?: string | null } | null
  ownerRow?: { id: string } | null
  memberRow?: { group_id: string } | null
}

function createSupabaseMock(options: SupabaseOptions = {}) {
  const groupsBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.ownerRow === undefined ? { id: '11111111-1111-4111-8111-111111111111' } : options.ownerRow,
      error: null,
    }),
  }

  const groupMembersBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.memberRow === undefined ? null : options.memberRow,
      error: null,
    }),
  }

  const groupsTable = {
    select: vi.fn().mockReturnValue(groupsBuilder),
  }

  const groupMembersTable = {
    select: vi.fn().mockReturnValue(groupMembersBuilder),
  }

  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session:
            options.sessionUser === undefined
              ? { user: { id: 'user-1', email: 'user@example.com' } }
              : options.sessionUser
                ? { user: options.sessionUser }
                : null,
        },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'groups') return groupsTable
      if (table === 'group_members') return groupMembersTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { supabase }
}

function makeJsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/recipe-import/parse', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/recipe-import/parse', () => {
  const groupId = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
    assertUserCanAccessGroupMock.mockResolvedValue(true)
    getMagicImportEntitlementStatusMock.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      planTier: 'free',
      periodStart: '2026-02-01',
      monthlyCredits: 40,
      usedCredits: 1,
      remainingCredits: 39,
      requiredCredits: 1,
      isUnlimited: false,
      hasActiveSubscription: false,
      graceActive: false,
      isEnvOverride: false,
    })
    syncUserSubscriptionByLookupMock.mockResolvedValue(false)
    isStripeBillingConfiguredMock.mockReturnValue(false)
    createSupabaseAdminClientMock.mockReturnValue({})
    getStripeClientMock.mockReturnValue({})
    checkRecipeImportRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 8,
      remaining: 7,
      retryAfterSeconds: 1,
    })
    recordImportUsageEventMock.mockResolvedValue(123)
    consumeUserImportCreditsMock.mockResolvedValue({
      allowed: true,
      requiredCredits: 1,
      periodStart: '2026-02-01',
      planTier: 'free',
      monthlyCredits: 40,
      usedCredits: 1,
      remainingCredits: 39,
    })
    parseRecipeWithOpenAIMock.mockResolvedValue({
      recipe: {
        name: 'Test Meal',
        description: '',
        category: null,
        weeknightFriendly: false,
        ingredients: [{ name: 'rice', quantity: '1', unit: 'cup' }],
        instructions: [],
        warnings: [],
        confidence: 0.9,
      },
      usage: {
        provider: 'openai',
        model: 'gpt-5-mini',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.01,
      },
    })
    normalizeParsedRecipeMock.mockImplementation((recipe) => recipe)
    parseRecipeFromPlainTextFallbackMock.mockReturnValue(null)
    fetchRecipeTextFromUrlMock.mockResolvedValue({ text: 'Recipe text', warnings: [] })
  })

  it('returns 400 for invalid request payloads', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        sourceType: 'text',
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload.',
      code: 'invalid_payload',
    })
  })

  it('returns 401 when no active session exists', async () => {
    const { supabase } = createSupabaseMock({ sessionUser: null })
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        groupId,
        sourceType: 'text',
        text: '1 cup rice',
      }) as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
      code: 'unauthorized',
    })
  })

  it('returns 403 when the user has no access to the requested group', async () => {
    const { supabase } = createSupabaseMock({ ownerRow: null, memberRow: null })
    createRouteHandlerClientMock.mockReturnValue(supabase)
    assertUserCanAccessGroupMock.mockResolvedValue(false)

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        groupId,
        sourceType: 'text',
        text: '1 cup rice',
      }) as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden: you do not have access to this group.',
      code: 'forbidden',
    })
  })

  it('returns 400 for text imports when text content is empty and records failure', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        groupId,
        sourceType: 'text',
        text: '    ',
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Recipe text is required for text import.',
      code: 'missing_text',
    })
    expect(recordImportUsageEventMock).toHaveBeenCalledTimes(2)
    expect(recordImportUsageEventMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        eventType: 'failure',
        statusCode: 400,
        errorCode: 'missing_text',
      }),
    )
  })

  it('returns 429 with retry header when rate limit is exceeded', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)
    checkRecipeImportRateLimitMock.mockResolvedValue({
      allowed: false,
      limit: 8,
      remaining: 0,
      retryAfterSeconds: 33,
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        groupId,
        sourceType: 'text',
        text: '1 cup rice',
      }) as never,
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('33')
    await expect(response.json()).resolves.toEqual({
      error: 'Too many recipe imports. Try again in about 33 seconds.',
      code: 'rate_limited',
      retryAfterSeconds: 33,
    })
  })

  it('returns 429 when entitlements do not allow importing', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)
    getMagicImportEntitlementStatusMock.mockResolvedValue({
      allowed: false,
      reasonCode: 'quota_exceeded',
      planTier: 'free',
      periodStart: '2026-02-01',
      monthlyCredits: 40,
      usedCredits: 40,
      remainingCredits: 0,
      requiredCredits: 1,
      isUnlimited: false,
      hasActiveSubscription: false,
      graceActive: false,
      isEnvOverride: false,
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        groupId,
        sourceType: 'text',
        text: '1 cup rice',
      }) as never,
    )

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      code: 'quota_exceeded',
      requiredCredits: 1,
      remainingCredits: 0,
      upgradeAvailable: false,
    })
    expect(consumeUserImportCreditsMock).not.toHaveBeenCalled()
  })

  it('skips credit consumption when an unlimited override is active', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)
    getMagicImportEntitlementStatusMock.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      planTier: 'override',
      periodStart: '2026-02-01',
      monthlyCredits: 40,
      usedCredits: 0,
      remainingCredits: 40,
      requiredCredits: 0,
      isUnlimited: true,
      hasActiveSubscription: false,
      graceActive: false,
      isEnvOverride: true,
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        groupId,
        sourceType: 'text',
        text: '1 cup rice',
      }) as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      usage: {
        creditsCharged: 0,
        planTier: 'override',
      },
    })
    expect(consumeUserImportCreditsMock).not.toHaveBeenCalled()
  })
})
