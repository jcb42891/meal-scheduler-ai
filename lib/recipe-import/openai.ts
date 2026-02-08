import OpenAI from 'openai'
import { ZodError } from 'zod'
import { parsedRecipeSchema } from './schema'
import type { ImportSourceType, ParsedRecipe } from './types'

const DEFAULT_MODEL = process.env.RECIPE_IMPORT_MODEL || 'gpt-4.1-mini'
const OPENAI_TIMEOUT_MS = 20_000

type ParseRecipeInput = {
  sourceType: ImportSourceType
  sourceText: string
  imageDataUrl?: string
  sourceUrl?: string
}

type LooseRecord = Record<string, unknown>

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  return new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: 1 })
}

function buildSystemPrompt() {
  return [
    'You extract recipes into structured JSON.',
    'Return valid JSON only, with no markdown or surrounding text.',
    'Schema requirements:',
    '{',
    '  "name": string,',
    '  "description": string,',
    '  "category": string | null,',
    '  "weeknightFriendly": boolean,',
    '  "ingredients": [{ "name": string, "quantity": number|string, "unit": string|null }],',
    '  "instructions": string[],',
    '  "warnings": string[],',
    '  "confidence": number|null',
    '}',
    'Use one of these categories if possible: Poultry, Beef, Pork, Fish, Vegetarian.',
    'Use concise ingredient names and preserve amounts when available.',
    'If uncertain, include a warning and lower confidence.',
  ].join('\n')
}

function buildUserPrompt(input: ParseRecipeInput): string {
  return [
    `Source type: ${input.sourceType}`,
    input.sourceUrl ? `Recipe URL: ${input.sourceUrl}` : '',
    'Extract this recipe into JSON schema format.',
    'Source content:',
    input.sourceText,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function firstString(record: LooseRecord, keys: string[]): string {
  for (const key of keys) {
    const found = asString(record[key])
    if (found) return found
  }
  return ''
}

function inferNameFromUrl(url: string | undefined): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const slug = parsed.pathname.split('/').filter(Boolean).pop() || ''
    const clean = slug
      .replace(/^\d+-/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
    if (!clean) return ''
    return clean
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  } catch {
    return ''
  }
}

function inferNameFromSourceText(sourceText: string): string {
  const line = sourceText
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.toLowerCase().startsWith('recipe:'))
  if (!line) return ''
  return line.slice('recipe:'.length).trim()
}

function parseIngredientLine(line: string): { name: string; quantity?: number | string; unit?: string | null } {
  const compact = line.trim().replace(/(\d)([A-Za-z])/g, '$1 $2')
  const match = compact.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+([a-zA-Z]+)?\s*(.*)$/)
  if (!match) return { name: compact }
  const quantity = match[1]
  const maybeUnit = (match[2] || '').trim()
  const remainder = (match[3] || '').trim()
  if (remainder) {
    return {
      name: remainder,
      quantity,
      unit: maybeUnit || null,
    }
  }
  return { name: compact }
}

function extractIngredientStringsFromSource(sourceText: string): string[] {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const ingredientsStart = lines.findIndex((line) => /^ingredients\s*:/i.test(line))
  if (ingredientsStart === -1) return []

  const endIndex = lines.findIndex((line, index) => index > ingredientsStart && /^instructions\s*:/i.test(line))
  const ingredientLines = lines.slice(ingredientsStart + 1, endIndex === -1 ? undefined : endIndex)
  return ingredientLines.filter((line) => !/^[-*•]\s*$/.test(line))
}

function coerceIngredients(record: LooseRecord, sourceText: string): Array<{ name: string; quantity?: number | string; unit?: string | null }> {
  const raw = record.ingredients ?? record.recipeIngredient ?? record.recipeIngredients
  const asArray = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : []
  const mapped = asArray
    .map((entry) => {
      if (typeof entry === 'string') return parseIngredientLine(entry)
      const obj = asRecord(entry)
      if (!obj) return null
      const name = firstString(obj, ['name', 'ingredient', 'item', 'food'])
      if (!name) return null
      const quantityValue = obj.quantity ?? obj.qty ?? obj.amount
      const quantityNumber = asNumber(quantityValue)
      const quantity =
        quantityNumber !== null ? quantityNumber : typeof quantityValue === 'string' ? quantityValue.trim() : undefined
      const unit = firstString(obj, ['unit', 'units', 'measurement']) || null
      return { name, quantity, unit }
    })
    .filter((entry): entry is NonNullable<typeof entry> => {
      if (!entry) return false
      return asString(entry.name).length > 0
    })

  if (mapped.length > 0) return mapped
  return extractIngredientStringsFromSource(sourceText).map(parseIngredientLine).filter((item) => item.name.length > 0)
}

function coerceInstructions(record: LooseRecord): string[] {
  const raw = record.instructions ?? record.recipeInstructions ?? []
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((entry) => {
      if (typeof entry === 'string') return [entry.trim()]
      const obj = asRecord(entry)
      if (!obj) return []
      const text = firstString(obj, ['text', 'instruction', 'step'])
      return text ? [text] : []
    })
    .filter(Boolean)
}

function coerceRecipeJsonShape(parsedJson: unknown, input: ParseRecipeInput): unknown {
  const record = asRecord(parsedJson)
  if (!record) return parsedJson

  const name =
    firstString(record, ['name', 'title', 'recipeName']) ||
    inferNameFromSourceText(input.sourceText) ||
    inferNameFromUrl(input.sourceUrl) ||
    'Imported Recipe'

  const description = firstString(record, ['description', 'summary', 'subtitle'])
  const category = firstString(record, ['category', 'recipeCategory']) || null

  const rawWeeknight = record.weeknightFriendly ?? record.weeknight_friendly
  const weeknightFriendly =
    typeof rawWeeknight === 'boolean'
      ? rawWeeknight
      : typeof rawWeeknight === 'string'
        ? rawWeeknight.trim().toLowerCase() === 'true'
        : false

  const warningsRaw = Array.isArray(record.warnings)
    ? record.warnings.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []

  const confidenceValue = asNumber(record.confidence)
  const confidence = confidenceValue === null ? null : Math.max(0, Math.min(1, confidenceValue))

  return {
    name,
    description,
    category,
    weeknightFriendly,
    ingredients: coerceIngredients(record, input.sourceText),
    instructions: coerceInstructions(record),
    warnings: warningsRaw,
    confidence,
  }
}

export async function parseRecipeWithOpenAI(input: ParseRecipeInput): Promise<ParsedRecipe> {
  const client = getClient()
  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: buildUserPrompt(input) }]

  if (input.imageDataUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: input.imageDataUrl },
    })
  }

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userContent as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart[] },
    ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  })

  const rawContent = completion.choices[0]?.message?.content
  if (!rawContent) {
    throw new Error('Model did not return a response payload.')
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawContent)
  } catch {
    throw new Error('Model response was not valid JSON.')
  }

  try {
    return parsedRecipeSchema.parse(parsedJson)
  } catch (error) {
    if (error instanceof ZodError) {
      try {
        const repaired = coerceRecipeJsonShape(parsedJson, input)
        return parsedRecipeSchema.parse(repaired)
      } catch {
        throw new Error('Model output did not match expected recipe schema.')
      }
    }
    throw error
  }
}
