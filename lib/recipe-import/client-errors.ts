type RecipeImportErrorInput = {
  status: number
  code?: string
  retryAfterSeconds?: number
}

type RecipeImportErrorPayload = {
  code?: string
  retryAfterSeconds?: number
}

const RATE_LIMIT_ERROR_CODES = new Set(['rate_limited'])
const INPUT_ERROR_CODES = new Set([
  'invalid_payload',
  'bad_request',
  'missing_url',
  'missing_text',
  'missing_image',
  'invalid_image_type',
  'image_too_large',
])

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export function readRecipeImportErrorPayload(payload: unknown): RecipeImportErrorPayload {
  const objectPayload = toObject(payload)
  if (!objectPayload) return {}

  const code = typeof objectPayload.code === 'string' ? objectPayload.code : undefined
  const retryAfterSeconds =
    typeof objectPayload.retryAfterSeconds === 'number' && Number.isFinite(objectPayload.retryAfterSeconds)
      ? Math.max(1, Math.round(objectPayload.retryAfterSeconds))
      : undefined

  return {
    code,
    retryAfterSeconds,
  }
}

export function getRecipeImportParseErrorMessage(input: RecipeImportErrorInput): string {
  if (input.status === 401 || input.code === 'unauthorized') {
    return 'Your session expired. Sign in again and try importing.'
  }

  if (input.status === 403 || input.code === 'forbidden') {
    return 'You do not have access to import recipes for this group.'
  }

  if (input.status === 429 || (input.code && RATE_LIMIT_ERROR_CODES.has(input.code))) {
    if (typeof input.retryAfterSeconds === 'number' && input.retryAfterSeconds > 0) {
      return `Too many recipe import attempts. Try again in about ${input.retryAfterSeconds} seconds.`
    }
    return 'Too many recipe import attempts. Please try again shortly.'
  }

  if (input.code === 'quota_exceeded') {
    return 'Magic Import credits are exhausted for your account. Upgrade billing or wait for the monthly reset.'
  }

  if (input.status === 504 || input.code === 'timeout' || input.code === 'parse_timeout') {
    return 'Recipe import timed out. Try again with a shorter recipe input.'
  }

  if (input.status === 422 || input.code === 'unprocessable_input') {
    return 'That recipe source could not be parsed. Try pasting recipe text or uploading an image.'
  }

  if (input.status === 400 || (input.code && INPUT_ERROR_CODES.has(input.code))) {
    return 'We could not read that recipe input. Check the URL, text, or image and try again.'
  }

  return 'We could not import that recipe right now. Please try again.'
}
