import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { z, ZodError } from 'zod'
import { importSourceTypeSchema, parseRequestJsonSchema } from '@/lib/recipe-import/schema'
import { fetchRecipeTextFromUrl } from '@/lib/recipe-import/url'
import { parseRecipeWithOpenAI } from '@/lib/recipe-import/openai'
import { parseRecipeFromPlainTextFallback } from '@/lib/recipe-import/fallback'
import { normalizeParsedRecipe } from '@/lib/recipe-import/normalize'
import { checkRecipeImportRateLimit } from '@/lib/recipe-import/rate-limit'
import { consumeUserImportCredits, recordImportUsageEvent } from '@/lib/recipe-import/usage'
import type { ImportSourceType } from '@/lib/recipe-import/types'
import { isStripeBillingConfigured } from '@/lib/billing/config'
import { createSupabaseAdminClient } from '@/lib/billing/supabase-admin'
import { getStripeClient } from '@/lib/billing/stripe'
import {
  assertUserCanAccessGroup,
  getMagicImportEntitlementStatus,
  syncUserSubscriptionByLookup,
} from '@/lib/billing/server'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const PARSE_TIMEOUT_MS = 25_000

class HttpError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    options?: {
      code?: string
      details?: Record<string, unknown>
    },
  ) {
    super(message)
    this.status = status
    this.code = options?.code ?? 'request_error'
    this.details = options?.details
  }
}

type ParsedInput = {
  groupId: string
  sourceType: ImportSourceType
  text?: string
  url?: string
  imageFile?: File
}

type UsageContext = {
  requestId: string
  userId: string
  groupId: string
  sourceType: ImportSourceType
  startedAtMs: number
  inputBytes: number
  attemptEventId?: number
  creditsCharged: number
}

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

const parsedInputSchema = z.object({
  groupId: z.string().uuid(),
  sourceType: importSourceTypeSchema,
  text: z.string().optional(),
  url: z.string().optional(),
  imageFile: z.instanceof(File).optional(),
})

async function parseRequestInput(req: NextRequest): Promise<ParsedInput> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const groupId = String(formData.get('groupId') ?? '')
    const sourceType = importSourceTypeSchema.parse(String(formData.get('sourceType') ?? ''))
    const text = String(formData.get('text') ?? '').trim()
    const url = String(formData.get('url') ?? '').trim()
    const imageValue = formData.get('image')

    return parsedInputSchema.parse({
      groupId,
      sourceType,
      text,
      url,
      imageFile: imageValue instanceof File ? imageValue : undefined,
    })
  }

  const body = parseRequestJsonSchema.parse(await req.json())
  return parsedInputSchema.parse({
    groupId: body.groupId,
    sourceType: body.sourceType,
    text: body.text,
    url: body.url,
  })
}

function validateImageFile(imageFile?: File): asserts imageFile is File {
  if (!imageFile) {
    throw new HttpError('An image file is required when sourceType is image.', 400, {
      code: 'missing_image',
    })
  }
  if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
    throw new HttpError('Only PNG, JPEG, and WEBP images are supported.', 400, {
      code: 'invalid_image_type',
    })
  }
  if (imageFile.size > MAX_IMAGE_BYTES) {
    throw new HttpError('Image file exceeds the 8MB upload limit.', 400, {
      code: 'image_too_large',
    })
  }
}

async function toDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer())
  return `data:${file.type};base64,${bytes.toString('base64')}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new HttpError(timeoutMessage, 504, { code: 'parse_timeout' })),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function statusFromError(error: Error): number {
  const message = error.message.toLowerCase()

  if (message.includes('timed out')) return 504
  if (message.includes('rate limit') || message.includes('quota')) return 429
  if (
    message.includes('invalid recipe url') ||
    message.includes('http/https') ||
    message.includes('private or local') ||
    message.includes('required for') ||
    message.includes('upload limit') ||
    message.includes('supported')
  ) {
    return 400
  }

  if (message.includes('blocked automated access')) return 422
  return 500
}

function errorCodeFromStatus(status: number): string {
  if (status === 400) return 'bad_request'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 422) return 'unprocessable_input'
  if (status === 429) return 'rate_limited'
  if (status === 504) return 'timeout'
  return 'server_error'
}

async function recordFailureEvent(
  supabase: SupabaseClient,
  usageContext: UsageContext,
  {
    status,
    code,
    message,
    metadata,
  }: {
    status: number
    code: string
    message: string
    metadata?: Record<string, unknown>
  },
) {
  try {
    await recordImportUsageEvent(supabase, {
      requestId: usageContext.requestId,
      eventType: 'failure',
      sourceType: usageContext.sourceType,
      groupId: usageContext.groupId,
      userId: usageContext.userId,
      statusCode: status,
      errorCode: code,
      errorMessage: message,
      costCredits: usageContext.creditsCharged,
      latencyMs: Date.now() - usageContext.startedAtMs,
      inputBytes: usageContext.inputBytes,
      metadata: {
        attemptEventId: usageContext.attemptEventId ?? null,
        ...metadata,
      },
    })
  } catch {
  }
}

export async function POST(req: NextRequest) {
  let supabase: SupabaseClient | null = null
  let usageContext: UsageContext | null = null

  try {
    const input = await parseRequestInput(req)
    const groupId = input.groupId

    const cookieStore = await cookies()
    const compatibleCookieGetter = (() => cookieStore) as unknown as RouteCookiesGetter
    supabase = createRouteHandlerClient({
      cookies: compatibleCookieGetter,
    })
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) throw sessionError
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    }

    const hasAccess = await assertUserCanAccessGroup(supabase, groupId, session.user.id)
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: 'Forbidden: you do not have access to this group.',
          code: 'forbidden',
        },
        { status: 403 },
      )
    }

    usageContext = {
      requestId: randomUUID(),
      userId: session.user.id,
      groupId,
      sourceType: input.sourceType,
      startedAtMs: Date.now(),
      inputBytes: 0,
      creditsCharged: 0,
    }

    usageContext.attemptEventId = await recordImportUsageEvent(supabase, {
      requestId: usageContext.requestId,
      eventType: 'attempt',
      sourceType: input.sourceType,
      groupId,
      userId: session.user.id,
      statusCode: 102,
      metadata: { route: '/api/recipe-import/parse' },
    })

    const rateLimit = await checkRecipeImportRateLimit(supabase, groupId)
    if (!rateLimit.allowed) {
      throw new HttpError(
        `Too many recipe imports. Try again in about ${rateLimit.retryAfterSeconds} seconds.`,
        429,
        {
          code: 'rate_limited',
          details: {
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          },
        },
      )
    }

    let entitlementStatus = await getMagicImportEntitlementStatus(supabase, {
      sourceType: input.sourceType,
      userId: session.user.id,
      userEmail: session.user.email,
    })

    if (!entitlementStatus.allowed && isStripeBillingConfigured() && !entitlementStatus.isEnvOverride) {
      try {
        const supabaseAdmin = createSupabaseAdminClient()
        const stripe = getStripeClient()
        const refreshed = await syncUserSubscriptionByLookup(supabaseAdmin, {
          stripe,
          userId: session.user.id,
        })

        if (refreshed) {
          entitlementStatus = await getMagicImportEntitlementStatus(supabase, {
            sourceType: input.sourceType,
            userId: session.user.id,
            userEmail: session.user.email,
          })
        }
      } catch {
      }
    }

    if (!entitlementStatus.allowed) {
      throw new HttpError(
        `Not enough import credits remaining this month. Required: ${entitlementStatus.requiredCredits}, remaining: ${entitlementStatus.remainingCredits}.`,
        429,
        {
          code: entitlementStatus.reasonCode ?? 'quota_exceeded',
          details: {
            requiredCredits: entitlementStatus.requiredCredits,
            remainingCredits: entitlementStatus.remainingCredits,
            monthlyCredits: entitlementStatus.monthlyCredits,
            usedCredits: entitlementStatus.usedCredits,
            periodStart: entitlementStatus.periodStart,
            planTier: entitlementStatus.planTier,
            hasActiveSubscription: entitlementStatus.hasActiveSubscription,
            graceActive: entitlementStatus.graceActive,
            isUnlimited: entitlementStatus.isUnlimited,
            isEnvOverride: entitlementStatus.isEnvOverride,
            upgradeAvailable: isStripeBillingConfigured() && !entitlementStatus.hasActiveSubscription,
          },
        },
      )
    }

    const warnings: string[] = []
    let sourceText = ''
    let imageDataUrl: string | undefined
    let sourceUrl: string | undefined

    if (input.sourceType === 'text') {
      const rawText = input.text?.trim() ?? ''
      if (!rawText) {
        throw new HttpError('Recipe text is required for text import.', 400, {
          code: 'missing_text',
        })
      }
      sourceText = rawText
      usageContext.inputBytes = Buffer.byteLength(rawText, 'utf8')
    }

    if (input.sourceType === 'url') {
      const rawUrl = input.url?.trim() ?? ''
      if (!rawUrl) {
        throw new HttpError('Recipe URL is required for URL import.', 400, {
          code: 'missing_url',
        })
      }

      const extracted = await fetchRecipeTextFromUrl(rawUrl)
      sourceUrl = rawUrl
      sourceText = extracted.text
      warnings.push(...extracted.warnings)
      usageContext.inputBytes = Buffer.byteLength(sourceText, 'utf8')
    }

    if (input.sourceType === 'image') {
      validateImageFile(input.imageFile)
      imageDataUrl = await toDataUrl(input.imageFile)
      sourceText = 'Extract the full recipe from this image. If text is unclear, add warnings.'
      usageContext.inputBytes = input.imageFile.size
    }

    const creditResult = entitlementStatus.isUnlimited
      ? {
          allowed: true,
          requiredCredits: 0,
          periodStart: entitlementStatus.periodStart,
          planTier: entitlementStatus.planTier,
          monthlyCredits: entitlementStatus.monthlyCredits,
          usedCredits: entitlementStatus.usedCredits,
          remainingCredits: entitlementStatus.remainingCredits,
        }
      : await consumeUserImportCredits(supabase, {
          userId: session.user.id,
          sourceType: input.sourceType,
          requestId: usageContext.requestId,
          usageEventId: usageContext.attemptEventId,
        })

    if (!creditResult.allowed) {
      throw new HttpError(
        `Not enough import credits remaining this month. Required: ${creditResult.requiredCredits}, remaining: ${creditResult.remainingCredits}.`,
        429,
        {
          code: 'quota_exceeded',
          details: {
            requiredCredits: creditResult.requiredCredits,
            remainingCredits: creditResult.remainingCredits,
            monthlyCredits: creditResult.monthlyCredits,
            usedCredits: creditResult.usedCredits,
            periodStart: creditResult.periodStart,
            planTier: creditResult.planTier,
            hasActiveSubscription: entitlementStatus.hasActiveSubscription,
            graceActive: entitlementStatus.graceActive,
            isUnlimited: entitlementStatus.isUnlimited,
            isEnvOverride: entitlementStatus.isEnvOverride,
            upgradeAvailable: isStripeBillingConfigured() && !entitlementStatus.hasActiveSubscription,
          },
        },
      )
    }

    usageContext.creditsCharged = creditResult.requiredCredits

    let parsedRecipe
    let usageMetadata:
      | {
          provider: 'openai'
          model: string
          inputTokens: number | null
          outputTokens: number | null
          totalTokens: number | null
          estimatedCostUsd: number | null
        }
      | null = null

    try {
      const parsedResult = await withTimeout(
        parseRecipeWithOpenAI({
          sourceType: input.sourceType,
          sourceText,
          imageDataUrl,
          sourceUrl,
        }),
        PARSE_TIMEOUT_MS,
        'AI parsing timed out. Try a shorter recipe input or try again.',
      )
      parsedRecipe = parsedResult.recipe
      usageMetadata = parsedResult.usage
    } catch (error) {
      const fallbackParsedRecipe = input.sourceType === 'text' ? parseRecipeFromPlainTextFallback(sourceText) : null

      if (!fallbackParsedRecipe) {
        throw error
      }

      warnings.push('AI parser could not fully read this recipe. Applied a text fallback parser.')
      parsedRecipe = fallbackParsedRecipe
    }

    const normalizedRecipe = normalizeParsedRecipe(parsedRecipe)
    const recipeWarnings = [...warnings, ...normalizedRecipe.warnings]

    await recordImportUsageEvent(supabase, {
      requestId: usageContext.requestId,
      eventType: 'success',
      sourceType: input.sourceType,
      groupId,
      userId: session.user.id,
      statusCode: 200,
      provider: usageMetadata?.provider,
      model: usageMetadata?.model,
      costCredits: usageContext.creditsCharged,
      costInputTokens: usageMetadata?.inputTokens ?? undefined,
      costOutputTokens: usageMetadata?.outputTokens ?? undefined,
      costTotalTokens: usageMetadata?.totalTokens ?? undefined,
      costUsd: usageMetadata?.estimatedCostUsd ?? undefined,
      latencyMs: Date.now() - usageContext.startedAtMs,
      inputBytes: usageContext.inputBytes,
      outputIngredientsCount: normalizedRecipe.ingredients.length,
      warningsCount: recipeWarnings.length,
      confidence: normalizedRecipe.confidence,
      metadata: {
        attemptEventId: usageContext.attemptEventId ?? null,
      },
    })

    return NextResponse.json({
      recipe: {
        ...normalizedRecipe,
        warnings: recipeWarnings,
      },
      source: {
        sourceType: input.sourceType,
        url: sourceUrl ?? null,
      },
      usage: {
        creditsCharged: usageContext.creditsCharged,
        creditsRemaining: creditResult.remainingCredits,
        monthlyCredits: creditResult.monthlyCredits,
        usedCredits: creditResult.usedCredits,
        periodStart: creditResult.periodStart,
        planTier: creditResult.planTier,
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request payload.',
          code: 'invalid_payload',
          details: error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      )
    }

    let status = 500
    let code = 'server_error'
    let message = 'Unexpected server error.'
    let details: Record<string, unknown> | undefined

    if (error instanceof HttpError) {
      status = error.status
      code = error.code
      message = error.message
      details = error.details
    } else if (error instanceof Error) {
      status = statusFromError(error)
      code = errorCodeFromStatus(status)
      message = error.message
    }

    if (supabase && usageContext) {
      await recordFailureEvent(supabase, usageContext, {
        status,
        code,
        message,
      })
    }

    const responsePayload: Record<string, unknown> = { error: message, code }
    if (details) {
      for (const [key, value] of Object.entries(details)) {
        responsePayload[key] = value
      }
    }

    const retryAfterSeconds =
      typeof responsePayload.retryAfterSeconds === 'number'
        ? responsePayload.retryAfterSeconds
        : undefined

    return NextResponse.json(responsePayload, {
      status,
      headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined,
    })
  }
}
