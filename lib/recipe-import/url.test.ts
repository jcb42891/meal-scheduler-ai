import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRecipeTextFromUrl, validateImportUrl } from './url'

describe('validateImportUrl', () => {
  it('accepts valid public http/https urls', () => {
    const parsed = validateImportUrl('https://example.com/recipe')

    expect(parsed.hostname).toBe('example.com')
  })

  it('rejects non-http protocols', () => {
    expect(() => validateImportUrl('ftp://example.com/recipe')).toThrow('Only http/https recipe URLs are allowed.')
  })

  it('rejects private or local hosts', () => {
    expect(() => validateImportUrl('http://localhost:3000/recipe')).toThrow(
      'Private or local recipe URLs are not allowed.',
    )
    expect(() => validateImportUrl('http://192.168.0.10/recipe')).toThrow(
      'Private or local recipe URLs are not allowed.',
    )
  })
})

describe('fetchRecipeTextFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('extracts structured recipe text from JSON-LD when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context":"https://schema.org",
                "@type":"Recipe",
                "name":"Pasta Primavera",
                "description":"A quick pasta dish",
                "recipeIngredient":["200g pasta","1 cup peas"],
                "recipeInstructions":[{"@type":"HowToStep","text":"Boil pasta"},{"@type":"HowToStep","text":"Mix with peas"}]
              }
            </script>
          </head>
        </html>
        `,
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRecipeTextFromUrl('https://example.com/pasta')

    expect(result.warnings).toEqual([])
    expect(result.text).toContain('Recipe: Pasta Primavera')
    expect(result.text).toContain('Ingredients:')
    expect(result.text).toContain('Instructions:')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to raw html payload when structured metadata is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html><body><h1>Recipe</h1></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRecipeTextFromUrl('https://example.com/no-json-ld')

    expect(result.text).toContain('RAW_HTML_START')
    expect(result.text).toContain('Recipe URL: https://example.com/no-json-ld')
    expect(result.warnings).toContain('Fetched URL was not marked as HTML. AI parsing may be less reliable.')
    expect(result.warnings).toContain('Structured recipe metadata was not found. Falling back to raw HTML parsing.')
  })

  it('retries blocked responses and throws a clear error for blocked sites', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(new Response('blocked-again', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchRecipeTextFromUrl('https://example.com/blocked')).rejects.toThrow(
      'This recipe site blocked automated access (status 403). Try Screenshot or Raw Text import for this recipe.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries when the first successful response is an access-challenge HTML page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          `
          <html>
            <head><title>Access Denied</title></head>
            <body>You don't have permission to access this page.</body>
          </html>
          `,
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `
          <html>
            <head>
              <script type="application/ld+json">
                {
                  "@context":"https://schema.org",
                  "@type":"Recipe",
                  "name":"Seared Salmon with Spicy Red Pepper Aioli",
                  "recipeIngredient":["4 salmon fillets","1 cup mayonnaise"],
                  "recipeInstructions":[{"@type":"HowToStep","text":"Preheat oven."}]
                }
              </script>
            </head>
          </html>
          `,
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRecipeTextFromUrl(
      'https://www.foodnetwork.com/recipes/ina-garten/seared-salmon-with-spicy-red-pepper-aioli-11887233',
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.text).toContain('Recipe: Seared Salmon with Spicy Red Pepper Aioli')
    expect(result.warnings).toContain(
      'Initial fetch returned an access-challenge page. Retried with alternate request headers.',
    )
  })

  it('throws a clear error when every successful response is an access-challenge page', async () => {
    const blockedHtml = `
      <html>
        <head><title>Access Denied</title></head>
        <body>You don't have permission to access this page.</body>
      </html>
    `
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(blockedHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(blockedHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchRecipeTextFromUrl(
        'https://www.foodnetwork.com/recipes/ina-garten/seared-salmon-with-spicy-red-pepper-aioli-11887233',
      ),
    ).rejects.toThrow(
      'This recipe site blocked automated access (challenge page). Try Screenshot or Raw Text import for this recipe.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
