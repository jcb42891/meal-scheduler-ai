import { MEAL_CATEGORIES } from '@/app/meals/meal-utils'
import type { ParsedRecipe, NormalizedRecipe } from './types'

const ALLOWED_UNITS = ['unit', 'oz', 'g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'cup'] as const
type AllowedUnit = (typeof ALLOWED_UNITS)[number]

const UNIT_ALIASES: Record<string, AllowedUnit> = {
  unit: 'unit',
  units: 'unit',
  each: 'unit',
  ea: 'unit',
  piece: 'unit',
  pieces: 'unit',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  cup: 'cup',
  cups: 'cup',
}

const CATEGORY_ALIASES: Record<string, string> = {
  poultry: MEAL_CATEGORIES.POULTRY,
  chicken: MEAL_CATEGORIES.POULTRY,
  turkey: MEAL_CATEGORIES.POULTRY,
  beef: MEAL_CATEGORIES.BEEF,
  steak: MEAL_CATEGORIES.BEEF,
  pork: MEAL_CATEGORIES.PORK,
  fish: MEAL_CATEGORIES.FISH,
  seafood: MEAL_CATEGORIES.FISH,
  vegetarian: MEAL_CATEGORIES.VEGETARIAN,
  veggie: MEAL_CATEGORIES.VEGETARIAN,
  vegan: MEAL_CATEGORIES.VEGETARIAN,
}

const FRACTION_PATTERN = /^(\d+)\s*\/\s*(\d+)$/
const MIXED_PATTERN = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/

function parseQuantityValue(value: string | number | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const mixedMatch = normalized.match(MIXED_PATTERN)
  if (mixedMatch) {
    const whole = Number(mixedMatch[1])
    const numerator = Number(mixedMatch[2])
    const denominator = Number(mixedMatch[3])
    if (denominator === 0) return null
    return whole + numerator / denominator
  }

  const fractionMatch = normalized.match(FRACTION_PATTERN)
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1])
    const denominator = Number(fractionMatch[2])
    if (denominator === 0) return null
    return numerator / denominator
  }

  const numeric = Number(normalized)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric
  }

  return null
}

function normalizeUnit(value: string | null | undefined): AllowedUnit {
  if (!value) return 'unit'
  const key = value.trim().toLowerCase()
  if ((ALLOWED_UNITS as readonly string[]).includes(key)) {
    return key as AllowedUnit
  }
  return UNIT_ALIASES[key] ?? 'unit'
}

function normalizeCategory(value: string | null | undefined): string {
  if (!value) return ''
  const key = value.trim().toLowerCase()
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key]

  for (const [alias, category] of Object.entries(CATEGORY_ALIASES)) {
    if (key.includes(alias)) {
      return category
    }
  }

  return ''
}

function normalizeInstructionList(instructions: string[] | undefined): string[] {
  return (instructions ?? []).map((instruction) => instruction.trim()).filter(Boolean)
}

function normalizeDescription(description: string | undefined): string {
  return (description ?? '').trim()
}

export function normalizeParsedRecipe(recipe: ParsedRecipe): NormalizedRecipe {
  const warnings = [...(recipe.warnings ?? [])]

  const normalizedIngredients = recipe.ingredients
    .map((ingredient) => {
      const name = ingredient.name.trim()
      if (!name) return null

      const quantity = parseQuantityValue(ingredient.quantity)
      if (!quantity) {
        warnings.push(`Missing or invalid quantity for "${name}". Defaulted to 1 unit.`)
      }

      return {
        name,
        quantity: quantity ?? 1,
        unit: normalizeUnit(ingredient.unit),
      }
    })
    .filter((ingredient): ingredient is NonNullable<typeof ingredient> => Boolean(ingredient))

  if (normalizedIngredients.length === 0) {
    throw new Error('Recipe could not be normalized because no valid ingredients were found.')
  }

  return {
    name: recipe.name.trim(),
    description: normalizeDescription(recipe.description),
    category: normalizeCategory(recipe.category),
    weeknightFriendly: recipe.weeknightFriendly ?? false,
    ingredients: normalizedIngredients,
    instructions: normalizeInstructionList(recipe.instructions),
    warnings,
    confidence: recipe.confidence ?? null,
  }
}
