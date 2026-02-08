import 'server-only'

import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

type GroupForInvites = {
  id: string
  name: string
  owner_id: string
}

export type ExistingMemberCheckResult = {
  isMember: boolean
  profileId: string | null
}

export type SendInviteEmailInput = {
  toEmail: string
  groupName: string
  inviterEmail: string
  inviteUrl: string
  expiresAt: string
}

export type SendInviteEmailResult = {
  provider: string
  externalMessageId: string | null
}

type SendInviteEmailResponse = {
  provider?: string
  id?: string
  error?: string
}

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase()
}

export function resolveAppOrigin(request: NextRequest) {
  return request.nextUrl.origin
}

export async function assertCanManageGroupInvites(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
) {
  const [{ data: group, error: groupError }, { data: membership, error: memberError }] = await Promise.all([
    supabase.from('groups').select('id, name, owner_id').eq('id', groupId).maybeSingle<GroupForInvites>(),
    supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (groupError) throw groupError
  if (memberError) throw memberError
  if (!group) return null

  const canManage = group.owner_id === userId || Boolean(membership)
  if (!canManage) return null

  return group
}

export async function checkExistingGroupMemberForEmail(
  supabase: SupabaseClient,
  groupId: string,
  groupOwnerId: string,
  email: string,
): Promise<ExistingMemberCheckResult> {
  const normalizedEmail = normalizeEmailAddress(email)
  const { data: invitedProfile, error: invitedProfileError } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', normalizedEmail)
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (invitedProfileError) {
    throw invitedProfileError
  }

  if (!invitedProfile?.id) {
    return { isMember: false, profileId: null }
  }

  if (invitedProfile.id === groupOwnerId) {
    return { isMember: true, profileId: invitedProfile.id }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', invitedProfile.id)
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  return { isMember: Boolean(membership), profileId: invitedProfile.id }
}

export async function sendInviteEmailUsingEdgeFunction(
  input: SendInviteEmailInput,
): Promise<SendInviteEmailResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const inviteFunctionSecret = process.env.INVITE_FUNCTION_SECRET

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  }

  if (!inviteFunctionSecret) {
    throw new Error('INVITE_FUNCTION_SECRET is not set.')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-group-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-invite-secret': inviteFunctionSecret,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  })

  let payload: SendInviteEmailResponse | null = null
  try {
    payload = (await response.json()) as SendInviteEmailResponse
  } catch {
    payload = null
  }

  if (!response.ok) {
    const responseMessage =
      typeof payload?.error === 'string' && payload.error.trim().length > 0
        ? payload.error
        : `Invite email delivery failed with status ${response.status}.`
    throw new Error(responseMessage)
  }

  return {
    provider: payload?.provider ?? 'unknown',
    externalMessageId: payload?.id ?? null,
  }
}
