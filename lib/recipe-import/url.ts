const MAX_HTML_CHARS = 1_200_000
const MAX_LLM_HTML_CHARS = 60_000
const REQUEST_TIMEOUT_MS = 10_000

const SCRIPT_TAG_PATTERN = /<script([^>]*)>([\s\S]*?)<\/script>/gi
const HTML_ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39|apos);/g
const BLOCKED_HTML_MARKERS = [
  '<title>access denied',
  '<h1>access denied',
  "you don't have permission to access",
  'verify you are human',
  'request blocked',
  'bot detection',
  'captcha',
]

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type UrlExtractionResult = {
  text: string
  warnings: string[]
}

function isLikelyPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1'
  ) {
    return true
  }

  if (
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('169.254.') ||
    host.startsWith('192.0.0.')
  ) {
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

  if (host.startsWith('100.')) {
    const secondOctet = Number(host.split('.')[1] ?? '')
    if (Number.isFinite(secondOctet) && secondOctet >= 64 && secondOctet <= 127) {
      return true
    }
  }

  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return true
  }

  return false
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

function isLikelyBlockedHtml(html: string): boolean {
  const sample = html.slice(0, 8_000).toLowerCase()
  return BLOCKED_HTML_MARKERS.some((marker) => sample.includes(marker))
}

function flattenRecipeCandidate(value: unknown): Record<string, unknown>[] {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(flattenRecipeCandidate)
  if (typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const graph = record['@graph']
  return [record, ...flattenRecipeCandidate(graph)]
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
    const scriptBody = match[2]?.trim() ?? ''
    if (!scriptBody) continue

    const typeMatch = attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)["']?/i)
    const scriptType = typeMatch?.[1]?.toLowerCase() ?? ''
    const isJsonLdScript = scriptType === 'application/ld+json'
    const looksLikeRecipeJson = scriptBody.includes('"@type":"Recipe"') || scriptBody.includes('"@type": "Recipe"')

    if (!isJsonLdScript && !looksLikeRecipeJson) {
      continue
    }

    try {
      const parsed = JSON.parse(scriptBody) as unknown
      const extracted = extractRecipeTextFromParsedJson(parsed)
      if (extracted) return extracted
    } catch {
      const decoded = decodeHtmlEntities(scriptBody)
      if (decoded === scriptBody) continue
      try {
        const parsed = JSON.parse(decoded) as unknown
        const extracted = extractRecipeTextFromParsedJson(parsed)
        if (extracted) return extracted
      } catch {
        continue
      }
    }
  }

  return null
}

function buildLlmHtmlPayload(url: string, html: string, warnings: string[]): string {
  const trimmed = html.trim()
  if (!trimmed) {
    throw new Error('Fetched recipe page did not contain readable HTML.')
  }

  let payloadHtml = trimmed
  if (payloadHtml.length > MAX_LLM_HTML_CHARS) {
    payloadHtml = payloadHtml.slice(0, MAX_LLM_HTML_CHARS)
    warnings.push('Raw HTML was truncated before AI parsing to stay within model context limits.')
  }

  return [
    `Recipe URL: ${url}`,
    'The following is raw HTML from the recipe page. Extract only the main recipe title, ingredients, and instructions.',
    'Prioritize JSON-LD recipe metadata if present. Ignore reviews, comments, nav, and recommendation carousels.',
    'RAW_HTML_START',
    payloadHtml,
    'RAW_HTML_END',
  ].join('\n')
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
    let html = ''
    let retriedAfterBlockedHtml = false

    for (const [attemptIndex, headers] of fetchAttempts.entries()) {
      const attemptResponse = await fetch(parsedUrl.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      response = attemptResponse

      if (!attemptResponse.ok) {
        if (![401, 403, 429].includes(attemptResponse.status)) break
        continue
      }

      const attemptHtml = await attemptResponse.text()
      const hasAnotherAttempt = attemptIndex < fetchAttempts.length - 1

      if (hasAnotherAttempt && isLikelyBlockedHtml(attemptHtml)) {
        retriedAfterBlockedHtml = true
        continue
      }

      html = attemptHtml
      break
    }

    if (!response || !response.ok) {
      if (response?.status && [401, 403, 429].includes(response.status)) {
        throw new Error(
          `This recipe site blocked automated access (status ${response.status}). Try Screenshot or Raw Text import for this recipe.`,
        )
      }
      throw new Error(`Failed to fetch recipe URL (status ${response?.status ?? 'unknown'}).`)
    }

    if (!html) {
      html = await response.text()
    }

    if (isLikelyBlockedHtml(html)) {
      throw new Error(
        'This recipe site blocked automated access (challenge page). Try Screenshot or Raw Text import for this recipe.',
      )
    }

    if (retriedAfterBlockedHtml) {
      warnings.push('Initial fetch returned an access-challenge page. Retried with alternate request headers.')
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      warnings.push('Fetched URL was not marked as HTML. AI parsing may be less reliable.')
    }

    if (html.length > MAX_HTML_CHARS) {
      html = html.slice(0, MAX_HTML_CHARS)
      warnings.push('Recipe page response was truncated before processing.')
    }

    const extractedRecipeText = extractRecipeTextFromJsonLd(html)
    if (extractedRecipeText) {
      return { text: extractedRecipeText, warnings }
    }

    warnings.push('Structured recipe metadata was not found. Falling back to raw HTML parsing.')
    return { text: buildLlmHtmlPayload(parsedUrl.toString(), html, warnings), warnings }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Fetching recipe URL timed out after 10 seconds. Try another source or paste text directly.')
      }
      throw error
    }

    throw new Error('Failed to fetch recipe URL.')
  } finally {
    clearTimeout(timeout)
  }
}
