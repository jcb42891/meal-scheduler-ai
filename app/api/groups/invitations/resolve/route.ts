import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { normalizeEmailAddress } from '@/lib/invites/server'
import { verifySignedInviteToken } from '@/lib/invites/token'

export const runtime = 'nodejs'

const resolveInviteRequestSchema = z.object({
  token: z.string().min(1),
})

type InvitationRow = {
  id: string
  email: string
  status: string
  expires_at: string | null
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return error.message
  }

  return 'Unexpected server error.'
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const { token } = resolveInviteRequestSchema.parse(await request.json())

    const tokenValidation = verifySignedInviteToken(token)
    if (!tokenValidation.valid) {
      return NextResponse.json({ error: 'Invalid or expired invitation link.' }, { status: 400 })
    }

    const supabaseAdmin = createSupabaseAdminClient()

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('group_invitations')
      .select('id, email, status, expires_at')
      .eq('id', tokenValidation.claims.inviteId)
      .maybeSingle<InvitationRow>()

    if (invitationError) {
      throw invitationError
    }

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found.', code: 'invite_not_found' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Invitation has already been used or is no longer valid.', code: 'invite_not_pending' },
        { status: 409 },
      )
    }

    const inviteExpiresAtMs = invitation.expires_at ? new Date(invitation.expires_at).getTime() : Number.NaN
    const isExpired = !Number.isFinite(inviteExpiresAtMs) || inviteExpiresAtMs <= Date.now()
    if (isExpired) {
      const { error: expireError } = await supabaseAdmin
        .from('group_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)
        .eq('status', 'pending')

      if (expireError) {
        throw expireError
      }

      return NextResponse.json({ error: 'Invitation has expired.', code: 'invite_expired' }, { status: 410 })
    }

    if (!('inviteeEmail' in tokenValidation.claims)) {
      return NextResponse.json(
        { error: 'This invitation link must be accepted after signing in.', code: 'requires_sign_in' },
        { status: 409 },
      )
    }

    const normalizedInviteEmail = normalizeEmailAddress(invitation.email)
    const normalizedTokenEmail = normalizeEmailAddress(tokenValidation.claims.inviteeEmail)
    if (!normalizedInviteEmail || normalizedInviteEmail !== normalizedTokenEmail) {
      return NextResponse.json({ error: 'Invalid or expired invitation link.' }, { status: 400 })
    }

    return NextResponse.json({
      inviteeEmail: normalizedInviteEmail,
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

    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 })
  }
}
