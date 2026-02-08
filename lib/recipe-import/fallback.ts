import type { ParsedRecipe } from './types'

const FRACTION_CHARS: Record<string, string> = {
  '\u00bc': '1/4',
  '\u00bd': '1/2',
  '\u00be': '3/4',
  '\u2150': '1/7',
  '\u2151': '1/9',
  '\u2152': '1/10',
  '\u2153': '1/3',
  '\u2154': '2/3',
  '\u2155': '1/5',
  '\u2156': '2/5',
  '\u2157': '3/5',
  '\u2158': '4/5',
  '\u2159': '1/6',
  '\u215a': '5/6',
  '\u215b': '1/8',
  '\u215c': '3/8',
  '\u215d': '5/8',
  '\u215e': '7/8',
}

const UNIT_ALIASES: Record<string, string> = {
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

const LEADING_QUANTITY_PATTERN = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.+)$/i

function normalizeFractionChars(text: string): string {
  let normalized = text
  for (const [fractionChar, fractionText] of Object.entries(FRACTION_CHARS)) {
    normalized = normalized
      .replace(new RegExp(`(\\d)${fractionChar}`, 'g'), `$1 ${fractionText}`)
      .replace(new RegExp(fractionChar, 'g'), fractionText)
  }
  return normalized
}

function normalizeSourceText(sourceText: string): string[] {
  return normalizeFractionChars(sourceText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[\-\*\u2022]\s*/, '').trim())
}

function parseIngredientLine(line: string): { name: string; quantity: number | string; unit: string | null } | null {
  const compactedLine = line.replace(/(\d)([A-Za-z])/g, '$1 $2')
  const match = compactedLine.match(LEADING_QUANTITY_PATTERN)
  if (!match) return null

  const qty = match[1]?.trim()
  let rest = match[2]?.trim()
  if (!qty || !rest) return null

  const tokens = rest.split(/\s+/)
  const first = tokens[0]?.toLowerCase() ?? ''
  const mappedUnit = UNIT_ALIASES[first]
  const unit = mappedUnit ?? null
  if (mappedUnit) {
    rest = tokens.slice(1).join(' ').trim()
  }

  const cleanedName = rest.replace(/^[,;:\-]+/, '').trim()
  if (!cleanedName) return null

  return {
    name: cleanedName,
    quantity: qty,
    unit,
  }
}

function inferRecipeName(sourceText: string): string {
  const lines = normalizeSourceText(sourceText)
  const explicitTitle = lines.find((line) => {
    if (line.length > 120) return false
    if (/^\d/.test(line)) return false
    if (/^yield\s*:?/i.test(line)) return false
    if (/^recipe url\s*:/i.test(line)) return false
    return /recipe|stew|soup|salad|pasta|chicken|beef|pork|fish/i.test(line)
  })
  if (explicitTitle) return explicitTitle.slice(0, 120)
  return 'Imported Recipe'
}

export function parseRecipeFromPlainTextFallback(sourceText: string): ParsedRecipe | null {
  const lines = normalizeSourceText(sourceText)
  const ingredients = lines
    .filter((line) => !/^yield\s*:?/i.test(line))
    .filter((line) => !/^\d+\s*servings?$/i.test(line))
    .map(parseIngredientLine)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  if (ingredients.length === 0) {
    return null
  }

  return {
    name: inferRecipeName(sourceText),
    description: '',
    category: null,
    weeknightFriendly: false,
    ingredients,
    instructions: [],
    warnings: ['Used fallback text parsing due AI extraction issues. Please review ingredient names and quantities.'],
    confidence: 0.45,
  }
}
