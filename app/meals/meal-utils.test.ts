import { describe, expect, it } from 'vitest'
import {
  MEAL_CATEGORIES,
  getCategoryColor,
  getWeeknightFriendlyColor,
  getWeeknightNotFriendlyColor,
} from './meal-utils'

describe('meal utils', () => {
  it('maps known categories to color tokens', () => {
    expect(getCategoryColor(MEAL_CATEGORIES.POULTRY)).toBe('bg-amber-100 text-amber-800')
    expect(getCategoryColor(MEAL_CATEGORIES.BEEF)).toBe('bg-red-100 text-red-900')
    expect(getCategoryColor(MEAL_CATEGORIES.PORK)).toBe('bg-orange-100 text-orange-800')
    expect(getCategoryColor(MEAL_CATEGORIES.FISH)).toBe('bg-blue-100 text-blue-800')
    expect(getCategoryColor(MEAL_CATEGORIES.VEGETARIAN)).toBe('bg-green-100 text-green-800')
  })

  it('returns a fallback color for unexpected categories', () => {
    expect(getCategoryColor('Unknown' as never)).toBe('bg-gray-100 text-gray-800')
  })

  it('exposes weeknight color helpers', () => {
    expect(getWeeknightFriendlyColor()).toBe('bg-emerald-100 text-emerald-800')
    expect(getWeeknightNotFriendlyColor()).toBe('bg-slate-100 text-slate-700')
  })
})
