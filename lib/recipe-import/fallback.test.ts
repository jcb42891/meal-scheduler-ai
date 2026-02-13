import { describe, expect, it } from 'vitest'
import { parseRecipeFromPlainTextFallback } from './fallback'

describe('parseRecipeFromPlainTextFallback', () => {
  it('parses normalized ingredient lines and infers a recipe title', () => {
    const sourceText = `
      Weeknight Chicken Soup Recipe
      Yield: 4 servings
      • 1½ cups chicken broth
      - 200g chicken breast
      * 2 tbsp olive oil
      1 cup carrots
      Recipe URL: https://example.com/chicken-soup
    `

    const parsed = parseRecipeFromPlainTextFallback(sourceText)

    expect(parsed).not.toBeNull()
    expect(parsed?.name).toBe('Weeknight Chicken Soup Recipe')
    expect(parsed?.description).toBe('')
    expect(parsed?.category).toBeNull()
    expect(parsed?.weeknightFriendly).toBe(false)
    expect(parsed?.instructions).toEqual([])
    expect(parsed?.confidence).toBe(0.45)
    expect(parsed?.warnings).toEqual([
      'Used fallback text parsing due AI extraction issues. Please review ingredient names and quantities.',
    ])
    expect(parsed?.ingredients).toEqual([
      { name: 'chicken broth', quantity: '1 1/2', unit: 'cup' },
      { name: 'chicken breast', quantity: '200', unit: 'g' },
      { name: 'olive oil', quantity: '2', unit: 'tbsp' },
      { name: 'carrots', quantity: '1', unit: 'cup' },
    ])
  })

  it('returns Imported Recipe when no explicit title-like line exists', () => {
    const sourceText = `
      Recipe URL: https://example.com
      Yield: 2 servings
      1 cup rice
      2 cups water
    `

    const parsed = parseRecipeFromPlainTextFallback(sourceText)

    expect(parsed).not.toBeNull()
    expect(parsed?.name).toBe('Imported Recipe')
    expect(parsed?.ingredients).toEqual([
      { name: 'rice', quantity: '1', unit: 'cup' },
      { name: 'water', quantity: '2', unit: 'cup' },
    ])
  })

  it('returns null when no ingredient lines can be parsed', () => {
    const sourceText = `
      This is an unstructured note.
      Mix everything together until it tastes right.
    `

    expect(parseRecipeFromPlainTextFallback(sourceText)).toBeNull()
  })
})
