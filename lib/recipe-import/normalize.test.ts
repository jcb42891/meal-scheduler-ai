import { describe, expect, it } from 'vitest'
import { normalizeParsedRecipe } from './normalize'

describe('normalizeParsedRecipe', () => {
  it('normalizes ingredient names, quantities, units, and category aliases', () => {
    const result = normalizeParsedRecipe({
      name: '  Quick CHICKEN soup  ',
      description: '  Weeknight soup  ',
      category: 'chicken dinner ideas',
      weeknightFriendly: true,
      ingredients: [
        { name: '  red onion ', quantity: '1 1/2', unit: 'Tablespoons' },
        { name: ' garlic ', quantity: '3/4', unit: 'cloves' },
      ],
      instructions: ['  sauté onions  ', '', 'add broth'],
      warnings: ['Source needed review'],
      confidence: 0.9,
    })

    expect(result).toEqual({
      name: 'Quick CHICKEN soup',
      description: 'Weeknight soup',
      category: 'Poultry',
      weeknightFriendly: true,
      ingredients: [
        { name: 'Red Onion', quantity: 1.5, unit: 'tbsp' },
        { name: 'Garlic', quantity: 0.75, unit: 'unit' },
      ],
      instructions: ['sauté onions', 'add broth'],
      warnings: ['Source needed review'],
      confidence: 0.9,
    })
  })

  it('defaults invalid quantities to 1 and emits warnings', () => {
    const result = normalizeParsedRecipe({
      name: 'Simple Salad',
      ingredients: [{ name: '  lettuce ', quantity: 'abc', unit: null }],
    })

    expect(result.ingredients).toEqual([{ name: 'Lettuce', quantity: 1, unit: 'unit' }])
    expect(result.warnings).toEqual(['Missing or invalid quantity for "Lettuce". Defaulted to 1 unit.'])
    expect(result.description).toBe('')
    expect(result.instructions).toEqual([])
    expect(result.weeknightFriendly).toBe(false)
    expect(result.category).toBe('')
    expect(result.confidence).toBeNull()
  })

  it('throws when no valid ingredients remain after normalization', () => {
    expect(() =>
      normalizeParsedRecipe({
        name: 'Invalid Recipe',
        ingredients: [{ name: '   ', quantity: 1, unit: 'unit' }],
      }),
    ).toThrow('Recipe could not be normalized because no valid ingredients were found.')
  })
})
