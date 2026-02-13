import { describe, expect, it } from 'vitest'
import { getRecipeImportParseErrorMessage, readRecipeImportErrorPayload } from './client-errors'

describe('readRecipeImportErrorPayload', () => {
  it('extracts code and retryAfterSeconds from valid payloads', () => {
    expect(
      readRecipeImportErrorPayload({
        code: 'rate_limited',
        retryAfterSeconds: 12.6,
      }),
    ).toEqual({
      code: 'rate_limited',
      retryAfterSeconds: 13,
    })
  })

  it('ignores malformed payloads', () => {
    expect(readRecipeImportErrorPayload('oops')).toEqual({})
    expect(readRecipeImportErrorPayload({ code: 123, retryAfterSeconds: 'later' })).toEqual({
      code: undefined,
      retryAfterSeconds: undefined,
    })
  })
})

describe('getRecipeImportParseErrorMessage', () => {
  it('maps auth and access errors to readable text', () => {
    expect(getRecipeImportParseErrorMessage({ status: 401 })).toBe(
      'Your session expired. Sign in again and try importing.',
    )
    expect(getRecipeImportParseErrorMessage({ status: 403 })).toBe(
      'You do not have access to import recipes for this group.',
    )
  })

  it('maps rate limiting with and without retry seconds', () => {
    expect(
      getRecipeImportParseErrorMessage({
        status: 429,
        retryAfterSeconds: 22,
      }),
    ).toBe('Too many recipe import attempts. Try again in about 22 seconds.')

    expect(
      getRecipeImportParseErrorMessage({
        status: 500,
        code: 'quota_exceeded',
      }),
    ).toBe('Too many recipe import attempts. Please try again shortly.')
  })

  it('maps timeout and unsupported source errors', () => {
    expect(
      getRecipeImportParseErrorMessage({
        status: 504,
      }),
    ).toBe('Recipe import timed out. Try again with a shorter recipe input.')

    expect(
      getRecipeImportParseErrorMessage({
        status: 422,
      }),
    ).toBe('That recipe source could not be parsed. Try pasting recipe text or uploading an image.')
  })

  it('maps bad input and unknown failures', () => {
    expect(
      getRecipeImportParseErrorMessage({
        status: 400,
      }),
    ).toBe('We could not read that recipe input. Check the URL, text, or image and try again.')

    expect(
      getRecipeImportParseErrorMessage({
        status: 500,
      }),
    ).toBe('We could not import that recipe right now. Please try again.')
  })
})
