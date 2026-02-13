import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import {
  normalizeEmailAddress,
  sendGroceryListEmailUsingEdgeFunction,
} from '@/lib/grocery-list/server'

export const runtime = 'nodejs'

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

const groceryListItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  total: z.number().finite().nonnegative(),
  unit: z.string().trim().max(40),
})

const sendGroceryListEmailSchema = z.object({
  listContextLabel: z.string().trim().min(1).max(120),
  items: z.array(groceryListItemSchema).min(1).max(300),
})

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Unexpected server error.'
}

export async function POST(request: NextRequest) {
  try {
    const { listContextLabel, items } = sendGroceryListEmailSchema.parse(await request.json())

    const cookieStore = await cookies()
    const compatibleCookieGetter = (() => cookieStore) as unknown as RouteCookiesGetter
    const supabase = createRouteHandlerClient({ cookies: compatibleCookieGetter })

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) throw sessionError
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const normalizedUserEmail = normalizeEmailAddress(session.user.email ?? '')
    if (!normalizedUserEmail) {
      return NextResponse.json({ error: 'No account email found for this user.' }, { status: 400 })
    }

    await sendGroceryListEmailUsingEdgeFunction({
      toEmail: normalizedUserEmail,
      listContextLabel,
      items,
    })

    return NextResponse.json({ success: true }, { status: 200 })
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

    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 })
  }
}

