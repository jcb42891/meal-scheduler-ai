const MAX_HTML_CHARS = 1_200_000
const MAX_EXTRACTED_TEXT_CHARS = 24_000
const REQUEST_TIMEOUT_MS = 10_000

const SCRIPT_TAG_PATTERN = /<script([^>]*)>([\s\S]*?)<\/script>/gi
const STRIP_SCRIPT_STYLE_PATTERN = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi
const STRIP_TAGS_PATTERN = /<\/?[^>]+(>|$)/g
const MULTISPACE_PATTERN = /\s+/g
const HTML_ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39|apos);/g
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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

function decodeHtmlEntities(value: string): string {
  return value.replace(HTML_ENTITY_PATTERN, (entity) => {
    switch (entity) {
      case '&amp;':
        return '&'
      case '&lt;':
        return '<'
      case '&gt;':
        return '>'
      case '&quot;':
        return '"'
      case '&#39;':
      case '&apos;':
        return "'"
      default:
        return entity
    }
  })
}

function extractRecipeTextFromParsedJson(value: unknown): string | null {
  const candidates = flattenRecipeCandidate(value)
  const recipe = candidates.find((candidate) => includesRecipeType(candidate['@type']))
  if (!recipe) return null

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

  return sections.length > 0 ? sections.join('\n\n') : null
}

function extractRecipeTextFromJsonLd(html: string): string | null {
  const scriptMatches = Array.from(html.matchAll(SCRIPT_TAG_PATTERN))

  for (const match of scriptMatches) {
    const attributes = match[1] ?? ''
    const scriptBody = match[2] ?? ''
    const typeMatch = attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)["']?/i)
    const scriptType = typeMatch?.[1]?.toLowerCase() ?? ''
    const isJsonLdScript = scriptType === 'application/ld+json'
    const looksLikeRecipeJson = scriptBody.includes('"@type":"Recipe"') || scriptBody.includes('"@type": "Recipe"')

    if (!isJsonLdScript && !looksLikeRecipeJson) {
      continue
    }

    const rawJson = scriptBody.trim()
    if (!rawJson) continue

    try {
      const parsed = JSON.parse(rawJson) as unknown
      const extracted = extractRecipeTextFromParsedJson(parsed)
      if (extracted) return extracted
    } catch {
      const decodedJson = decodeHtmlEntities(rawJson)
      if (decodedJson === rawJson) continue

      try {
        const parsedDecoded = JSON.parse(decodedJson) as unknown
        const extracted = extractRecipeTextFromParsedJson(parsedDecoded)
        if (extracted) return extracted
      } catch {
        continue
      }
    }
  }

  return null
}

function limitExtractedText(text: string, warnings: string[]): string {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) return text
  warnings.push('Extracted recipe text was truncated to keep AI parsing reliable.')
  return text.slice(0, MAX_EXTRACTED_TEXT_CHARS)
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
    const fetchAttempts: Array<HeadersInit> = [
      {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${parsedUrl.protocol}//${parsedUrl.host}/`,
        'User-Agent': BROWSER_USER_AGENT,
      },
      {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    ]

    let response: Response | null = null
    for (const headers of fetchAttempts) {
      response = await fetch(parsedUrl.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      if (response.ok) break
      if (![401, 403, 429].includes(response.status)) break
    }

    if (!response || !response.ok) {
      if (response?.status && [401, 403, 429].includes(response.status)) {
        throw new Error(
          `This recipe site blocked automated access (status ${response.status}). Try Screenshot or Raw Text import for this recipe.`,
        )
      }
      throw new Error(`Failed to fetch recipe URL (status ${response?.status ?? 'unknown'}).`)
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
      return { text: limitExtractedText(jsonLdRecipeText, warnings), warnings }
    }

    warnings.push('Structured recipe metadata was not found. Fell back to plain-text page extraction.')
    const fallbackText = stripHtmlToText(html)
    if (!fallbackText) {
      throw new Error('Unable to extract readable text from the recipe URL.')
    }

    return { text: limitExtractedText(fallbackText, warnings), warnings }
  } finally {
    clearTimeout(timeout)
  }
}
