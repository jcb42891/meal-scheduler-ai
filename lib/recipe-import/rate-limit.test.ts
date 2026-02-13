import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRecipeImportRateLimit } from './rate-limit'

type RpcResult = {
  data: unknown
  error: { message?: string } | null
}

function createSupabaseMock(result: RpcResult) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

describe('checkRecipeImportRateLimit', () => {
  const originalWindow = process.env.RECIPE_IMPORT_RATE_LIMIT_WINDOW_SECONDS
  const originalMax = process.env.RECIPE_IMPORT_RATE_LIMIT_MAX_REQUESTS

  beforeEach(() => {
    delete process.env.RECIPE_IMPORT_RATE_LIMIT_WINDOW_SECONDS
    delete process.env.RECIPE_IMPORT_RATE_LIMIT_MAX_REQUESTS
  })

  afterEach(() => {
    process.env.RECIPE_IMPORT_RATE_LIMIT_WINDOW_SECONDS = originalWindow
    process.env.RECIPE_IMPORT_RATE_LIMIT_MAX_REQUESTS = originalMax
  })

  it('maps rpc response values into normalized integer fields', async () => {
    const supabase = createSupabaseMock({
      data: {
        allowed: true,
        limit_count: '9',
        remaining: '-4',
        retry_after_seconds: '0',
      },
      error: null,
    })

    const result = await checkRecipeImportRateLimit(supabase as never, 'group-1')

    expect(supabase.rpc).toHaveBeenCalledWith('consume_recipe_import_rate_limit', {
      p_group_id: 'group-1',
      p_window_seconds: 300,
      p_max_requests: 8,
    })
    expect(result).toEqual({
      allowed: true,
      limit: 9,
      remaining: 0,
      retryAfterSeconds: 1,
    })
  })

  it('uses env overrides for window and max requests', async () => {
    process.env.RECIPE_IMPORT_RATE_LIMIT_WINDOW_SECONDS = '120'
    process.env.RECIPE_IMPORT_RATE_LIMIT_MAX_REQUESTS = '3'

    const supabase = createSupabaseMock({
      data: {
        allowed: false,
        limit_count: null,
        remaining: null,
        retry_after_seconds: null,
      },
      error: null,
    })

    const result = await checkRecipeImportRateLimit(supabase as never, 'group-2')

    expect(supabase.rpc).toHaveBeenCalledWith('consume_recipe_import_rate_limit', {
      p_group_id: 'group-2',
      p_window_seconds: 120,
      p_max_requests: 3,
    })
    expect(result).toEqual({
      allowed: false,
      limit: 3,
      remaining: 0,
      retryAfterSeconds: 120,
    })
  })

  it('throws if rpc returns an error', async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: { message: 'rpc failed' },
    })

    await expect(checkRecipeImportRateLimit(supabase as never, 'group-3')).rejects.toThrow('rpc failed')
  })

  it('throws when rpc returns no row', async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: null,
    })

    await expect(checkRecipeImportRateLimit(supabase as never, 'group-4')).rejects.toThrow(
      'Rate limit check returned an empty response.',
    )
  })
})
