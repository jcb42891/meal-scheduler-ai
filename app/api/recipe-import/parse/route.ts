import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { z, ZodError } from 'zod'
import { importSourceTypeSchema, parseRequestJsonSchema } from '@/lib/recipe-import/schema'
import { fetchRecipeTextFromUrl } from '@/lib/recipe-import/url'
import { parseRecipeWithOpenAI } from '@/lib/recipe-import/openai'
import { normalizeParsedRecipe } from '@/lib/recipe-import/normalize'
import type { ImportSourceType } from '@/lib/recipe-import/types'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

type ParsedInput = {
  groupId: string
  sourceType: ImportSourceType
  text?: string
  url?: string
  imageFile?: File
}

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
    throw new Error('An image file is required when sourceType is image.')
  }
  if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
    throw new Error('Only PNG, JPEG, and WEBP images are supported.')
  }
  if (imageFile.size > MAX_IMAGE_BYTES) {
    throw new Error('Image file exceeds the 8MB upload limit.')
  }
}

async function userHasGroupAccess(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
) {
  const [{ data: ownerRow, error: ownerError }, { data: memberRow, error: memberError }] = await Promise.all([
    supabase.from('groups').select('id').eq('id', groupId).eq('owner_id', userId).maybeSingle(),
    supabase.from('group_members').select('group_id').eq('group_id', groupId).eq('user_id', userId).maybeSingle(),
  ])

  if (ownerError) throw ownerError
  if (memberError) throw memberError

  return Boolean(ownerRow || memberRow)
}

async function toDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer())
  return `data:${file.type};base64,${bytes.toString('base64')}`
}

export async function POST(req: NextRequest) {
  try {
    const input = await parseRequestInput(req)
    const groupId = input.groupId

    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) throw sessionError
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await userHasGroupAccess(supabase, groupId, session.user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: you do not have access to this group.' }, { status: 403 })
    }

    const warnings: string[] = []
    let sourceText = ''
    let imageDataUrl: string | undefined
    let sourceUrl: string | undefined

    if (input.sourceType === 'text') {
      const rawText = input.text?.trim() ?? ''
      if (!rawText) {
        return NextResponse.json({ error: 'Recipe text is required for text import.' }, { status: 400 })
      }
      sourceText = rawText
    }

    if (input.sourceType === 'url') {
      const rawUrl = input.url?.trim() ?? ''
      if (!rawUrl) {
        return NextResponse.json({ error: 'Recipe URL is required for URL import.' }, { status: 400 })
      }

      const extracted = await fetchRecipeTextFromUrl(rawUrl)
      sourceUrl = rawUrl
      sourceText = extracted.text
      warnings.push(...extracted.warnings)
    }

    if (input.sourceType === 'image') {
      validateImageFile(input.imageFile)
      imageDataUrl = await toDataUrl(input.imageFile)
      sourceText = 'Extract the full recipe from this image. If text is unclear, add warnings.'
    }

    const parsedRecipe = await parseRecipeWithOpenAI({
      sourceType: input.sourceType,
      sourceText,
      imageDataUrl,
      sourceUrl,
    })

    const normalizedRecipe = normalizeParsedRecipe(parsedRecipe)

    return NextResponse.json({
      recipe: {
        ...normalizedRecipe,
        warnings: [...warnings, ...normalizedRecipe.warnings],
      },
      source: {
        sourceType: input.sourceType,
        url: sourceUrl ?? null,
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request payload.',
          details: error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      )
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
