const DEFAULT_WINDOW_SECONDS = 5 * 60
const DEFAULT_MAX_REQUESTS = 8

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function getWindowMs() {
  const value = Number(process.env.RECIPE_IMPORT_RATE_LIMIT_WINDOW_SECONDS ?? DEFAULT_WINDOW_SECONDS)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_WINDOW_SECONDS * 1000
  return Math.floor(value * 1000)
}

function getMaxRequests() {
  const value = Number(process.env.RECIPE_IMPORT_RATE_LIMIT_MAX_REQUESTS ?? DEFAULT_MAX_REQUESTS)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_REQUESTS
  return Math.floor(value)
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

export function checkRecipeImportRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  const windowMs = getWindowMs()
  const maxRequests = getMaxRequests()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  buckets.set(key, existing)
  return {
    allowed: true,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}
