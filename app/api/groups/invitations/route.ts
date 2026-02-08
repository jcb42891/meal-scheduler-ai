import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z, ZodError } from 'zod'
import {
  assertCanManageGroupInvites,
  checkExistingGroupMemberForEmail,
  normalizeEmailAddress,
  resolveAppOrigin,
  sendInviteEmailUsingEdgeFunction,
} from '@/lib/invites/server'
import { createSignedInviteToken } from '@/lib/invites/token'

export const runtime = 'nodejs'

type RouteCookiesGetter = () => Promise<Awaited<ReturnType<typeof cookies>>>

const createInvitationRequestSchema = z.object({
  groupId: z.string().uuid(),
  email: z.string().email(),
})

type InvitationRow = {
  id: string
  group_id: string
  email: string
  status: string
  created_at: string
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
    const { groupId, email } = createInvitationRequestSchema.parse(await request.json())

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
      return NextResponse.json({ error: 'Forbidden: you cannot invite members to this group.' }, { status: 403 })
    }

    const normalizedInviteEmail = normalizeEmailAddress(email)
    const normalizedUserEmail = normalizeEmailAddress(session.user.email ?? '')

    if (!normalizedInviteEmail) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    if (normalizedUserEmail && normalizedUserEmail === normalizedInviteEmail) {
      return NextResponse.json({ error: 'You are already a member of this group.' }, { status: 409 })
    }

    const existingMember = await checkExistingGroupMemberForEmail(
      supabase,
      groupId,
      group.owner_id,
      normalizedInviteEmail,
    )
    if (existingMember.isMember) {
      return NextResponse.json({ error: 'That user is already a member of this group.' }, { status: 409 })
    }

    const { data: existingInvite, error: existingInviteError } = await supabase
      .from('group_invitations')
      .select('id')
      .eq('group_id', groupId)
      .eq('email', normalizedInviteEmail)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle<{ id: string }>()

    if (existingInviteError) throw existingInviteError
    if (existingInvite) {
      return NextResponse.json({ error: 'An invitation is already pending for this email.' }, { status: 409 })
    }

    const { data: invitation, error: invitationError } = await supabase
      .from('group_invitations')
      .insert({
        group_id: groupId,
        email: normalizedInviteEmail,
        invited_by: session.user.id,
        status: 'pending',
      })
      .select('id, group_id, email, status, created_at, expires_at')
      .single<InvitationRow>()

    if (invitationError) throw invitationError
    if (!invitation) {
      throw new Error('Invitation creation failed.')
    }

    const inviteToken = createSignedInviteToken({
      inviteId: invitation.id,
      expiresAt: invitation.expires_at,
    })
    const inviteUrl = `${resolveAppOrigin(request)}/groups/accept-invite?token=${encodeURIComponent(inviteToken)}`
    const attemptedAt = new Date().toISOString()
    const inviterEmail = normalizeEmailAddress(session.user.email ?? '')

    let emailDeliveryStatus: 'sent' | 'failed' = 'failed'
    let emailDeliveryError: string | null = null
    let emailDeliveryProvider: string | null = null
    let emailDeliveryExternalId: string | null = null

    try {
      const emailResult = await sendInviteEmailUsingEdgeFunction({
        toEmail: invitation.email,
        groupName: group.name,
        inviterEmail: inviterEmail || 'A group owner',
        inviteUrl,
        expiresAt: invitation.expires_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      emailDeliveryStatus = 'sent'
      emailDeliveryProvider = emailResult.provider
      emailDeliveryExternalId = emailResult.externalMessageId
    } catch (error) {
      emailDeliveryError = toErrorMessage(error)
    }

    const { error: trackingError } = await supabase
      .from('group_invitations')
      .update({
        email_delivery_status: emailDeliveryStatus,
        email_delivery_provider: emailDeliveryProvider,
        email_delivery_external_id: emailDeliveryExternalId,
        email_delivery_error: emailDeliveryError,
        email_delivery_attempted_at: attemptedAt,
      })
      .eq('id', invitation.id)

    if (trackingError) throw trackingError

    return NextResponse.json(
      {
        invitation: {
          ...invitation,
          email_delivery_status: emailDeliveryStatus,
          email_delivery_attempted_at: attemptedAt,
        },
        inviteUrl,
        emailDelivery: {
          status: emailDeliveryStatus,
          provider: emailDeliveryProvider,
          externalMessageId: emailDeliveryExternalId,
          error: emailDeliveryError,
        },
      },
      { status: 201 },
    )
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

