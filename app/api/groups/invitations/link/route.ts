import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z, ZodError } from 'zod'
import { assertCanManageGroupInvites, resolveAppOrigin } from '@/lib/invites/server'
import { createSignedInviteToken } from '@/lib/invites/token'

export const runtime = 'nodejs'

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

const invitationLinkRequestSchema = z.object({
  groupId: z.string().uuid(),
  inviteId: z.string().uuid(),
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
    const { groupId, inviteId } = invitationLinkRequestSchema.parse(await request.json())

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

    const group = await assertCanManageGroupInvites(supabase, groupId, session.user.id)
    if (!group) {
      return NextResponse.json({ error: 'Forbidden: you cannot manage invites for this group.' }, { status: 403 })
    }

    const { data: invitation, error: invitationError } = await supabase
      .from('group_invitations')
      .select('id, group_id, email, status, expires_at')
      .eq('id', inviteId)
      .eq('group_id', groupId)
      .maybeSingle<InvitationRow>()

    if (invitationError) throw invitationError
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending invitations can be shared.' }, { status: 409 })
    }

    const isExpired = invitation.expires_at ? new Date(invitation.expires_at).getTime() <= Date.now() : false
    if (isExpired) {
      const { error: expireError } = await supabase
        .from('group_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)
        .eq('status', 'pending')

      if (expireError) throw expireError

      return NextResponse.json({ error: 'Invitation has expired.' }, { status: 410 })
    }

    const inviteToken = createSignedInviteToken({
      inviteId: invitation.id,
      expiresAt: invitation.expires_at,
    })
    const inviteUrl = `${resolveAppOrigin(request)}/groups/accept-invite?token=${encodeURIComponent(inviteToken)}`

    return NextResponse.json({
      inviteUrl,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expires_at: invitation.expires_at,
        status: invitation.status,
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

    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 })
  }
}

