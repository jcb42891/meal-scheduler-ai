import OpenAI from 'openai'
import { ZodError } from 'zod'
import { parsedRecipeSchema } from './schema'
import type { ImportSourceType, ParsedRecipe } from './types'

const DEFAULT_MODEL = process.env.RECIPE_IMPORT_MODEL || 'gpt-4.1-mini'

type ParseRecipeInput = {
  sourceType: ImportSourceType
  sourceText: string
  imageDataUrl?: string
  sourceUrl?: string
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  return new OpenAI({ apiKey })
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
      throw new Error('Model output did not match expected recipe schema.')
    }
    throw error
  }
}
