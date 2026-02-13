import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const verifySignedInviteTokenMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/invites/token', () => ({
  verifySignedInviteToken: verifySignedInviteTokenMock,
}))

type InvitationRow = {
  id: string
  group_id: string
  email: string
  status: string
  expires_at: string | null
}

type SupabaseMockOptions = {
  sessionUser?: { id: string; email?: string | null } | null
  sessionError?: { message: string } | null
  invitation?: InvitationRow | null
  invitationError?: { message: string } | null
  expiredUpdateError?: { message: string } | null
  profileUpsertError?: { message: string } | null
  membershipInsertError?: { message: string; code?: string } | null
  acceptUpdateData?: { id: string } | null
  acceptUpdateError?: { message: string } | null
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const invitation = options.invitation ?? {
    id: 'invite-1',
    group_id: 'group-1',
    email: 'invitee@example.com',
    status: 'pending',
    expires_at: '2030-01-01T00:00:00.000Z',
  }

  const groupInvitationsSelectBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: invitation,
      error: options.invitationError ?? null,
    }),
  }

  const acceptedInvitation = options.acceptUpdateData ?? { id: invitation?.id ?? 'invite-1' }
  const acceptedUpdateBuilder = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: acceptedInvitation,
        error: options.acceptUpdateError ?? null,
      }),
    }),
  }

  const groupInvitationsTable = {
    select: vi.fn().mockReturnValue(groupInvitationsSelectBuilder),
    update: vi.fn().mockImplementation((payload: { status: string }) => {
      if (payload.status === 'accepted') {
        return acceptedUpdateBuilder
      }

      let eqCalls = 0
      const expiredBuilder = {
        eq: vi.fn().mockImplementation(() => {
          eqCalls += 1
          if (eqCalls >= 2) {
            return Promise.resolve({ error: options.expiredUpdateError ?? null })
          }
          return expiredBuilder
        }),
      }
      return expiredBuilder
    }),
  }

  const profilesTable = {
    upsert: vi.fn().mockResolvedValue({
      error: options.profileUpsertError ?? null,
    }),
  }

  const groupMembersTable = {
    insert: vi.fn().mockResolvedValue({
      error: options.membershipInsertError ?? null,
    }),
  }

  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session:
            options.sessionUser === undefined
              ? { user: { id: 'user-1', email: 'invitee@example.com' } }
              : options.sessionUser
                ? { user: options.sessionUser }
                : null,
        },
        error: options.sessionError ?? null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'group_invitations') return groupInvitationsTable
      if (table === 'profiles') return profilesTable
      if (table === 'group_members') return groupMembersTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return {
    supabase,
    groupInvitationsTable,
    profilesTable,
    groupMembersTable,
  }
}

function makeJsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/groups/invitations/accept', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/groups/invitations/accept', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
  })

  it('returns 401 when user is not authenticated', async () => {
    const { supabase } = createSupabaseMock({ sessionUser: null })
    createRouteHandlerClientMock.mockReturnValue(supabase)
    verifySignedInviteTokenMock.mockReturnValue({ valid: true, claims: { inviteId: 'invite-1' } })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'signed-token' }) as never)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when invite token is invalid', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)
    verifySignedInviteTokenMock.mockReturnValue({ valid: false, reason: 'Invalid token signature.' })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'bad-token' }) as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired invitation link.' })
  })

  it('marks expired pending invitations as expired and returns 410', async () => {
    const { supabase, groupInvitationsTable } = createSupabaseMock({
      invitation: {
        id: 'invite-1',
        group_id: 'group-1',
        email: 'invitee@example.com',
        status: 'pending',
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    })
    createRouteHandlerClientMock.mockReturnValue(supabase)
    verifySignedInviteTokenMock.mockReturnValue({ valid: true, claims: { inviteId: 'invite-1' } })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'signed-token' }) as never)

    expect(groupInvitationsTable.update).toHaveBeenCalledWith({ status: 'expired' })
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: 'Invitation has expired.' })
  })

  it('returns 403 when invitation email does not match current user email', async () => {
    const { supabase } = createSupabaseMock({
      sessionUser: { id: 'user-1', email: 'different@example.com' },
      invitation: {
        id: 'invite-1',
        group_id: 'group-1',
        email: 'invitee@example.com',
        status: 'pending',
        expires_at: '2030-01-01T00:00:00.000Z',
      },
    })
    createRouteHandlerClientMock.mockReturnValue(supabase)
    verifySignedInviteTokenMock.mockReturnValue({ valid: true, claims: { inviteId: 'invite-1' } })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'signed-token' }) as never)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'This invitation does not belong to your account.' })
  })

  it('accepts invitation successfully and tolerates duplicate membership insert', async () => {
    const { supabase, profilesTable, groupMembersTable, groupInvitationsTable } = createSupabaseMock({
      membershipInsertError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    createRouteHandlerClientMock.mockReturnValue(supabase)
    verifySignedInviteTokenMock.mockReturnValue({ valid: true, claims: { inviteId: 'invite-1' } })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'signed-token' }) as never)

    expect(profilesTable.upsert).toHaveBeenCalledWith(
      {
        id: 'user-1',
        email: 'invitee@example.com',
      },
      { onConflict: 'id' },
    )
    expect(groupMembersTable.insert).toHaveBeenCalledWith({
      group_id: 'group-1',
      user_id: 'user-1',
      role: 'member',
    })
    expect(groupInvitationsTable.update).toHaveBeenCalledWith({ status: 'accepted' })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      groupId: 'group-1',
    })
  })
})
