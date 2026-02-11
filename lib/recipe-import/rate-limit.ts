import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_WINDOW_SECONDS = 5 * 60
const DEFAULT_MAX_REQUESTS = 8

type RateLimitRpcRow = {
  allowed: boolean | null
  limit_count: number | string | null
  remaining: number | string | null
  retry_after_seconds: number | string | null
}

function getWindowSeconds() {
  const value = Number(process.env.RECIPE_IMPORT_RATE_LIMIT_WINDOW_SECONDS ?? DEFAULT_WINDOW_SECONDS)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_WINDOW_SECONDS
  return Math.floor(value)
}

function getMaxRequests() {
  const value = Number(process.env.RECIPE_IMPORT_RATE_LIMIT_MAX_REQUESTS ?? DEFAULT_MAX_REQUESTS)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_REQUESTS
  return Math.floor(value)
}

function asInteger(value: number | string | null, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.floor(parsed)
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

export async function checkRecipeImportRateLimit(
  supabase: SupabaseClient,
  groupId: string,
): Promise<RateLimitResult> {
  const maxRequests = getMaxRequests()
  const windowSeconds = getWindowSeconds()

  const { data, error } = await supabase.rpc('consume_recipe_import_rate_limit', {
    p_group_id: groupId,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  })

  if (error) {
    throw new Error(error.message || 'Unable to enforce recipe import rate limit.')
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRpcRow | null | undefined
  if (!row) {
    throw new Error('Rate limit check returned an empty response.')
  }

  return {
    allowed: row.allowed === true,
    limit: asInteger(row.limit_count, maxRequests),
    remaining: Math.max(0, asInteger(row.remaining, 0)),
    retryAfterSeconds: Math.max(1, asInteger(row.retry_after_seconds, windowSeconds)),
  }
}
