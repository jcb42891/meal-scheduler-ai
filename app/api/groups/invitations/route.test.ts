import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const assertCanManageGroupInvitesMock = vi.hoisted(() => vi.fn())
const checkExistingGroupMemberForEmailMock = vi.hoisted(() => vi.fn())
const normalizeEmailAddressMock = vi.hoisted(() => vi.fn((email: string) => email.trim().toLowerCase()))
const resolveAppOriginMock = vi.hoisted(() => vi.fn())
const sendInviteEmailUsingEdgeFunctionMock = vi.hoisted(() => vi.fn())
const createSignedInviteTokenMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/invites/server', () => ({
  assertCanManageGroupInvites: assertCanManageGroupInvitesMock,
  checkExistingGroupMemberForEmail: checkExistingGroupMemberForEmailMock,
  normalizeEmailAddress: normalizeEmailAddressMock,
  resolveAppOrigin: resolveAppOriginMock,
  sendInviteEmailUsingEdgeFunction: sendInviteEmailUsingEdgeFunctionMock,
}))

vi.mock('@/lib/invites/token', () => ({
  createSignedInviteToken: createSignedInviteTokenMock,
}))

type Group = {
  id: string
  name: string
  owner_id: string
}

type InvitationRow = {
  id: string
  group_id: string
  email: string
  status: string
  created_at: string
  expires_at: string | null
}

type SupabaseOptions = {
  sessionUser?: { id: string; email?: string | null } | null
  existingInvite?: { id: string } | null
  existingInviteError?: { message: string } | null
  invitation?: InvitationRow | null
  invitationInsertError?: { message: string } | null
  trackingError?: { message: string } | null
}

function createSupabaseMock(options: SupabaseOptions = {}) {
  const invitation = options.invitation ?? {
    id: 'invite-1',
    group_id: 'group-1',
    email: 'invitee@example.com',
    status: 'pending',
    created_at: '2026-02-13T00:00:00.000Z',
    expires_at: '2030-01-01T00:00:00.000Z',
  }

  const selectExistingInviteBuilder = {
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.existingInvite ?? null,
      error: options.existingInviteError ?? null,
    }),
  }

  const groupInvitationsTable = {
    select: vi.fn().mockReturnValue(selectExistingInviteBuilder),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: invitation,
          error: options.invitationInsertError ?? null,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        error: options.trackingError ?? null,
      }),
    }),
  }

  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session:
            options.sessionUser === undefined
              ? { user: { id: 'owner-1', email: 'owner@example.com' } }
              : options.sessionUser
                ? { user: options.sessionUser }
                : null,
        },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'group_invitations') return groupInvitationsTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return {
    supabase,
    groupInvitationsTable,
  }
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/groups/invitations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/groups/invitations', () => {
  const group: Group = {
    id: 'group-1',
    name: 'Family Meals',
    owner_id: 'owner-1',
  }
  const baseBody = {
    groupId: '11111111-1111-4111-8111-111111111111',
    email: 'invitee@example.com',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
    assertCanManageGroupInvitesMock.mockResolvedValue(group)
    checkExistingGroupMemberForEmailMock.mockResolvedValue({ isMember: false, profileId: null })
    resolveAppOriginMock.mockReturnValue('https://app.example.com')
    createSignedInviteTokenMock.mockReturnValue('invite-token')
    sendInviteEmailUsingEdgeFunctionMock.mockResolvedValue({
      provider: 'resend',
      externalMessageId: 'msg-1',
    })
  })

  it('returns 401 for unauthenticated users', async () => {
    const { supabase } = createSupabaseMock({ sessionUser: null })
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeRequest(baseBody) as never)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 when user cannot invite members to this group', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)
    assertCanManageGroupInvitesMock.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(makeRequest(baseBody) as never)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden: you cannot invite members to this group.',
    })
  })

  it('returns 409 when inviting your own email address', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeRequest({ ...baseBody, email: 'OWNER@example.com' }) as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'You are already a member of this group.',
    })
  })

  it('returns 409 when an invitation is already pending for the email', async () => {
    const { supabase } = createSupabaseMock({ existingInvite: { id: 'invite-existing' } })
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeRequest(baseBody) as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'An invitation is already pending for this email.',
    })
  })

  it('creates invite and returns 201 with sent email metadata', async () => {
    const { supabase, groupInvitationsTable } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeRequest(baseBody) as never)
    const json = await response.json()

    expect(groupInvitationsTable.insert).toHaveBeenCalledWith({
      group_id: '11111111-1111-4111-8111-111111111111',
      email: 'invitee@example.com',
      invited_by: 'owner-1',
      status: 'pending',
    })
    expect(sendInviteEmailUsingEdgeFunctionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'invitee@example.com',
        groupName: 'Family Meals',
        inviterEmail: 'owner@example.com',
      }),
    )
    expect(createSignedInviteTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteeEmail: 'invitee@example.com',
      }),
    )
    expect(response.status).toBe(201)
    expect(json).toMatchObject({
      inviteUrl: 'https://app.example.com/groups/accept-invite?token=invite-token',
      emailDelivery: {
        status: 'sent',
        provider: 'resend',
        externalMessageId: 'msg-1',
        error: null,
      },
    })
  })

  it('still returns 201 when email delivery fails and tracks failed status', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)
    sendInviteEmailUsingEdgeFunctionMock.mockRejectedValue(new Error('Email function failed'))

    const { POST } = await import('./route')
    const response = await POST(makeRequest(baseBody) as never)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      emailDelivery: {
        status: 'failed',
        provider: null,
        externalMessageId: null,
        error: 'Email function failed',
      },
    })
  })
})
