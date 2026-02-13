import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { verifySignedInviteToken } from '@/lib/invites/token'

export const runtime = 'nodejs'

const resolveInviteRequestSchema = z.object({
  token: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const { token } = resolveInviteRequestSchema.parse(await request.json())

    const tokenValidation = verifySignedInviteToken(token)
    if (!tokenValidation.valid) {
      return NextResponse.json({ error: 'Invalid or expired invitation link.' }, { status: 400 })
    }

    if (!('inviteeEmail' in tokenValidation.claims)) {
      return NextResponse.json(
        { error: 'This invitation link must be accepted after signing in.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      inviteeEmail: tokenValidation.claims.inviteeEmail,
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

    if (error instanceof Error && error.message.trim().length > 0) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
