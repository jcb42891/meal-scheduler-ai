import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeUserImportCredits,
  getUserMagicImportStatus,
  recordImportUsageEvent,
} from './usage'

type RpcResult = {
  data: unknown
  error: { message?: string } | null
}

function createSupabaseMock(result: RpcResult) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

describe('recordImportUsageEvent', () => {
  it('records usage and returns a normalized integer id', async () => {
    const supabase = createSupabaseMock({
      data: ['42'],
      error: null,
    })

    const result = await recordImportUsageEvent(supabase as never, {
      requestId: 'request-1',
      eventType: 'attempt',
      sourceType: 'url',
      groupId: 'group-1',
      userId: 'user-1',
    })

    expect(result).toBe(42)
    expect(supabase.rpc).toHaveBeenCalledWith('record_import_usage_event', {
      p_request_id: 'request-1',
      p_event_type: 'attempt',
      p_source_type: 'url',
      p_group_id: 'group-1',
      p_user_id: 'user-1',
      p_status_code: null,
      p_error_code: null,
      p_error_message: null,
      p_provider: null,
      p_model: null,
      p_cost_credits: 0,
      p_cost_input_tokens: null,
      p_cost_output_tokens: null,
      p_cost_total_tokens: null,
      p_cost_usd: null,
      p_latency_ms: null,
      p_input_bytes: null,
      p_output_ingredients_count: null,
      p_warnings_count: null,
      p_confidence: null,
      p_metadata: {},
    })
  })

  it('throws when rpc returns an error', async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: { message: 'rpc failed' },
    })

    await expect(
      recordImportUsageEvent(supabase as never, {
        requestId: 'request-2',
        eventType: 'failure',
        sourceType: 'text',
        groupId: 'group-2',
        userId: 'user-2',
      }),
    ).rejects.toThrow('rpc failed')
  })

  it('throws when rpc returns an invalid event id', async () => {
    const supabase = createSupabaseMock({
      data: [0],
      error: null,
    })

    await expect(
      recordImportUsageEvent(supabase as never, {
        requestId: 'request-3',
        eventType: 'success',
        sourceType: 'image',
        groupId: 'group-3',
        userId: 'user-3',
      }),
    ).rejects.toThrow('Usage event ledger returned an invalid event id.')
  })
})

describe('consumeUserImportCredits', () => {
  const originalMonthlyCredits = process.env.RECIPE_IMPORT_MONTHLY_CREDITS
  const originalImageCredits = process.env.RECIPE_IMPORT_CREDITS_IMAGE
  const originalUrlCredits = process.env.RECIPE_IMPORT_CREDITS_URL
  const originalTextCredits = process.env.RECIPE_IMPORT_CREDITS_TEXT

  beforeEach(() => {
    delete process.env.RECIPE_IMPORT_MONTHLY_CREDITS
    delete process.env.RECIPE_IMPORT_CREDITS_IMAGE
    delete process.env.RECIPE_IMPORT_CREDITS_URL
    delete process.env.RECIPE_IMPORT_CREDITS_TEXT
  })

  afterEach(() => {
    process.env.RECIPE_IMPORT_MONTHLY_CREDITS = originalMonthlyCredits
    process.env.RECIPE_IMPORT_CREDITS_IMAGE = originalImageCredits
    process.env.RECIPE_IMPORT_CREDITS_URL = originalUrlCredits
    process.env.RECIPE_IMPORT_CREDITS_TEXT = originalTextCredits
  })

  it('consumes credits using env overrides and normalizes rpc values', async () => {
    process.env.RECIPE_IMPORT_MONTHLY_CREDITS = '75'
    process.env.RECIPE_IMPORT_CREDITS_URL = '3'

    const supabase = createSupabaseMock({
      data: {
        allowed: true,
        required_credits: '3',
        period_start: '2026-02-01',
        plan_tier: '  pro  ',
        monthly_credits: '75',
        used_credits: '-2',
        remaining_credits: '70',
      },
      error: null,
    })

    const result = await consumeUserImportCredits(supabase as never, {
      userId: 'user-1',
      sourceType: 'url',
      requestId: 'request-4',
      usageEventId: 11,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('consume_user_import_credits', {
      p_user_id: 'user-1',
      p_source_type: 'url',
      p_credits: 3,
      p_request_id: 'request-4',
      p_usage_event_id: 11,
      p_default_monthly_credits: 75,
    })
    expect(result).toEqual({
      allowed: true,
      requiredCredits: 3,
      periodStart: '2026-02-01',
      planTier: 'pro',
      monthlyCredits: 75,
      usedCredits: 0,
      remainingCredits: 70,
    })
  })

  it('falls back to defaults when env or rpc numeric values are invalid', async () => {
    process.env.RECIPE_IMPORT_MONTHLY_CREDITS = '-9'
    process.env.RECIPE_IMPORT_CREDITS_IMAGE = '0'

    const supabase = createSupabaseMock({
      data: [
        {
          allowed: false,
          required_credits: null,
          period_start: '2026-02-02',
          plan_tier: '',
          monthly_credits: null,
          used_credits: null,
          remaining_credits: null,
        },
      ],
      error: null,
    })

    const result = await consumeUserImportCredits(supabase as never, {
      userId: 'user-2',
      sourceType: 'image',
      requestId: 'request-5',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('consume_user_import_credits', {
      p_user_id: 'user-2',
      p_source_type: 'image',
      p_credits: 3,
      p_request_id: 'request-5',
      p_usage_event_id: null,
      p_default_monthly_credits: 40,
    })
    expect(result).toEqual({
      allowed: false,
      requiredCredits: 3,
      periodStart: '2026-02-02',
      planTier: 'free',
      monthlyCredits: 40,
      usedCredits: 0,
      remainingCredits: 0,
    })
  })

  it('throws when rpc returns an error', async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: { message: 'consume failed' },
    })

    await expect(
      consumeUserImportCredits(supabase as never, {
        userId: 'user-3',
        sourceType: 'text',
        requestId: 'request-6',
      }),
    ).rejects.toThrow('consume failed')
  })

  it('throws when rpc returns no consumption row', async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: null,
    })

    await expect(
      consumeUserImportCredits(supabase as never, {
        userId: 'user-4',
        sourceType: 'text',
        requestId: 'request-7',
      }),
    ).rejects.toThrow('Credit accounting returned an empty response.')
  })
})

describe('getUserMagicImportStatus', () => {
  const originalMonthlyCredits = process.env.RECIPE_IMPORT_MONTHLY_CREDITS
  const originalImageCredits = process.env.RECIPE_IMPORT_CREDITS_IMAGE
  const originalUrlCredits = process.env.RECIPE_IMPORT_CREDITS_URL
  const originalTextCredits = process.env.RECIPE_IMPORT_CREDITS_TEXT

  beforeEach(() => {
    delete process.env.RECIPE_IMPORT_MONTHLY_CREDITS
    delete process.env.RECIPE_IMPORT_CREDITS_IMAGE
    delete process.env.RECIPE_IMPORT_CREDITS_URL
    delete process.env.RECIPE_IMPORT_CREDITS_TEXT
  })

  afterEach(() => {
    process.env.RECIPE_IMPORT_MONTHLY_CREDITS = originalMonthlyCredits
    process.env.RECIPE_IMPORT_CREDITS_IMAGE = originalImageCredits
    process.env.RECIPE_IMPORT_CREDITS_URL = originalUrlCredits
    process.env.RECIPE_IMPORT_CREDITS_TEXT = originalTextCredits
  })

  it('calls RPC with weighted source credits and normalizes response', async () => {
    process.env.RECIPE_IMPORT_CREDITS_URL = '4'
    const supabase = createSupabaseMock({
      data: {
        allowed: true,
        reason_code: null,
        plan_tier: ' pro ',
        period_start: '2026-02-01',
        monthly_credits: '120',
        used_credits: '20',
        remaining_credits: '100',
        required_credits: '4',
        is_unlimited: false,
        has_active_subscription: true,
        grace_active: false,
      },
      error: null,
    })

    const result = await getUserMagicImportStatus(supabase as never, {
      userId: 'user-1',
      sourceType: 'url',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('get_user_magic_import_status', {
      p_user_id: 'user-1',
      p_source_type: 'url',
      p_required_credits: 4,
      p_default_monthly_credits: 40,
    })
    expect(result).toEqual({
      allowed: true,
      reasonCode: null,
      planTier: 'pro',
      periodStart: '2026-02-01',
      monthlyCredits: 120,
      usedCredits: 20,
      remainingCredits: 100,
      requiredCredits: 4,
      isUnlimited: false,
      hasActiveSubscription: true,
      graceActive: false,
    })
  })

  it('throws when RPC status row is missing', async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: null,
    })

    await expect(
      getUserMagicImportStatus(supabase as never, {
        userId: 'user-2',
        sourceType: 'text',
      }),
    ).rejects.toThrow('Import entitlement status returned an empty response.')
  })
})
