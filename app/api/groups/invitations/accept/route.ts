import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z, ZodError } from 'zod'
import { normalizeEmailAddress } from '@/lib/invites/server'
import { verifySignedInviteToken } from '@/lib/invites/token'

export const runtime = 'nodejs'

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

const acceptInviteRequestSchema = z.object({
  token: z.string().min(1),
})

type InvitationRow = {
  id: string
  group_id: string
  email: string
  status: string
  expires_at: string | null
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Unexpected server error.'
}

export async function POST(request: NextRequest) {
  try {
    const { token } = acceptInviteRequestSchema.parse(await request.json())

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

    const tokenValidation = verifySignedInviteToken(token)
    if (!tokenValidation.valid) {
      return NextResponse.json({ error: 'Invalid or expired invitation link.' }, { status: 400 })
    }

    const { data: invitation, error: invitationError } = await supabase
      .from('group_invitations')
      .select('id, group_id, email, status, expires_at')
      .eq('id', tokenValidation.claims.inviteId)
      .maybeSingle<InvitationRow>()

    if (invitationError) throw invitationError
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation has already been used or is no longer valid.' }, { status: 409 })
    }

    const inviteExpiresAtMs = invitation.expires_at ? new Date(invitation.expires_at).getTime() : Number.NaN
    const isExpired = !Number.isFinite(inviteExpiresAtMs) || inviteExpiresAtMs <= Date.now()
    if (isExpired) {
      const { error: expireError } = await supabase
        .from('group_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)
        .eq('status', 'pending')

      if (expireError) throw expireError

      return NextResponse.json({ error: 'Invitation has expired.' }, { status: 410 })
    }

    const normalizedInviteEmail = normalizeEmailAddress(invitation.email)
    const normalizedUserEmail = normalizeEmailAddress(session.user.email ?? '')
    if (!normalizedUserEmail || normalizedInviteEmail !== normalizedUserEmail) {
      return NextResponse.json({ error: 'This invitation does not belong to your account.' }, { status: 403 })
    }

    // Ensure invitees always have a profile row before creating group membership.
    const { error: profileUpsertError } = await supabase.from('profiles').upsert(
      {
        id: session.user.id,
        email: normalizedUserEmail,
      },
      {
        onConflict: 'id',
      },
    )

    if (profileUpsertError) {
      throw profileUpsertError
    }

    const { error: membershipError } = await supabase.from('group_members').insert({
      group_id: invitation.group_id,
      user_id: session.user.id,
      role: 'member',
    })

    if (membershipError && membershipError.code !== '23505') {
      throw membershipError
    }

    const { data: acceptedInvitation, error: acceptError } = await supabase
      .from('group_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle<{ id: string }>()

    if (acceptError) throw acceptError
    if (!acceptedInvitation) {
      return NextResponse.json({ error: 'Invitation has already been accepted.' }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      groupId: invitation.group_id,
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
