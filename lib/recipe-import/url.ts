const MAX_HTML_CHARS = 1_200_000
const REQUEST_TIMEOUT_MS = 10_000

const SCRIPT_JSON_LD_PATTERN = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
const STRIP_SCRIPT_STYLE_PATTERN = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi
const STRIP_TAGS_PATTERN = /<\/?[^>]+(>|$)/g
const MULTISPACE_PATTERN = /\s+/g

type UrlExtractionResult = {
  text: string
  warnings: string[]
}

function isLikelyPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.local') || host === '::1') {
    return true
  }

  if (host.startsWith('127.') || host.startsWith('10.')) {
    return true
  }

  if (host.startsWith('192.168.')) {
    return true
  }

  if (host.startsWith('172.')) {
    const secondOctet = Number(host.split('.')[1] ?? '')
    if (Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
      return true
    }
  }

  return false
}

function flattenRecipeCandidate(value: unknown): Record<string, unknown>[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.flatMap(flattenRecipeCandidate)
  }
  if (typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>
  const graph = record['@graph']
  const nested = flattenRecipeCandidate(graph)
  return [record, ...nested]
}

function includesRecipeType(typeValue: unknown): boolean {
  if (typeof typeValue === 'string') {
    return typeValue.toLowerCase().includes('recipe')
  }
  if (Array.isArray(typeValue)) {
    return typeValue.some((entry) => typeof entry === 'string' && entry.toLowerCase().includes('recipe'))
  }
  return false
}

function toInstructionLines(raw: unknown): string[] {
  if (!raw) return []

  if (typeof raw === 'string') {
    return [raw.trim()].filter(Boolean)
  }

  if (Array.isArray(raw)) {
    return raw
      .flatMap((entry) => {
        if (typeof entry === 'string') return [entry.trim()]
        if (entry && typeof entry === 'object') {
          const maybeText = (entry as Record<string, unknown>).text
          if (typeof maybeText === 'string') return [maybeText.trim()]
        }
        return []
      })
      .filter(Boolean)
  }

  return []
}

function stripHtmlToText(html: string): string {
  return html
    .replace(STRIP_SCRIPT_STYLE_PATTERN, ' ')
    .replace(STRIP_TAGS_PATTERN, ' ')
    .replace(MULTISPACE_PATTERN, ' ')
    .trim()
}

function extractRecipeTextFromJsonLd(html: string): string | null {
  const matches = Array.from(html.matchAll(SCRIPT_JSON_LD_PATTERN))

  for (const match of matches) {
    const rawJson = match[1]?.trim()
    if (!rawJson) continue

    try {
      const parsed = JSON.parse(rawJson) as unknown
      const candidates = flattenRecipeCandidate(parsed)
      const recipe = candidates.find((candidate) => includesRecipeType(candidate['@type']))
      if (!recipe) continue

      const name = typeof recipe.name === 'string' ? recipe.name.trim() : ''
      const description = typeof recipe.description === 'string' ? recipe.description.trim() : ''
      const ingredients = Array.isArray(recipe.recipeIngredient)
        ? recipe.recipeIngredient.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
      const instructions = toInstructionLines(recipe.recipeInstructions)

      const sections = [
        name ? `Recipe: ${name}` : '',
        description ? `Description: ${description}` : '',
        ingredients.length > 0 ? `Ingredients:\n${ingredients.join('\n')}` : '',
        instructions.length > 0 ? `Instructions:\n${instructions.join('\n')}` : '',
      ].filter(Boolean)

      if (sections.length > 0) {
        return sections.join('\n\n')
      }
    } catch {
      continue
    }
  }

  return null
}

export function validateImportUrl(inputUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(inputUrl)
  } catch {
    throw new Error('Invalid recipe URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https recipe URLs are allowed.')
  }

  if (isLikelyPrivateHost(parsed.hostname)) {
    throw new Error('Private or local recipe URLs are not allowed.')
  }

  return parsed
}

export async function fetchRecipeTextFromUrl(inputUrl: string): Promise<UrlExtractionResult> {
  const parsedUrl = validateImportUrl(inputUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const warnings: string[] = []

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'PantryPlannerRecipeImporter/1.0',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch recipe URL (status ${response.status}).`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      warnings.push('Fetched URL was not marked as HTML; extraction quality may be limited.')
    }

    let html = await response.text()
    if (html.length > MAX_HTML_CHARS) {
      html = html.slice(0, MAX_HTML_CHARS)
      warnings.push('Recipe page was truncated to keep extraction bounded.')
    }

    const jsonLdRecipeText = extractRecipeTextFromJsonLd(html)
    if (jsonLdRecipeText) {
      return { text: jsonLdRecipeText, warnings }
    }

    warnings.push('Structured recipe metadata was not found. Fell back to plain-text page extraction.')
    const fallbackText = stripHtmlToText(html)
    if (!fallbackText) {
      throw new Error('Unable to extract readable text from the recipe URL.')
    }

    return { text: fallbackText, warnings }
  } finally {
    clearTimeout(timeout)
  }
}

