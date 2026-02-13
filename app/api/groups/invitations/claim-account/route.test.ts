import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClientMock = vi.hoisted(() => vi.fn())
const verifySignedInviteTokenMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/invites/token', () => ({
  verifySignedInviteToken: verifySignedInviteTokenMock,
}))

type InvitationRow = {
  id: string
  email: string
  status: string
  expires_at: string | null
}

type SupabaseMockOptions = {
  invitation?: InvitationRow | null
  invitationError?: { message: string } | null
  expireUpdateError?: { message: string } | null
  createUserError?: { message: string } | null
  createUserData?: { user: { id: string } | null }
  profileUpsertError?: { message: string } | null
}

function createSupabaseAdminMock(options: SupabaseMockOptions = {}) {
  const invitation =
    options.invitation === undefined
      ? {
          id: 'invite-1',
          email: 'invitee@example.com',
          status: 'pending',
          expires_at: '2030-01-01T00:00:00.000Z',
        }
      : options.invitation

  const invitationSelectBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: invitation,
      error: options.invitationError ?? null,
    }),
  }

  const groupInvitationsTable = {
    select: vi.fn().mockReturnValue(invitationSelectBuilder),
    update: vi.fn().mockImplementation(() => {
      let eqCalls = 0
      const expiredBuilder = {
        eq: vi.fn().mockImplementation(() => {
          eqCalls += 1
          if (eqCalls >= 2) {
            return Promise.resolve({ error: options.expireUpdateError ?? null })
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

  const supabaseAdmin = {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: options.createUserData ?? { user: { id: 'user-1' } },
          error: options.createUserError ?? null,
        }),
      },
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'group_invitations') return groupInvitationsTable
      if (table === 'profiles') return profilesTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return {
    supabaseAdmin,
    groupInvitationsTable,
    profilesTable,
  }
}

function makeJsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/groups/invitations/claim-account', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/groups/invitations/claim-account', () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  beforeEach(() => {
    vi.resetAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey
  })

  it('returns 400 for invalid tokens', async () => {
    verifySignedInviteTokenMock.mockReturnValue({ valid: false, reason: 'Invalid token signature.' })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        token: 'bad-token',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired invitation link.' })
  })

  it('returns 409 for legacy tokens without invitee email', async () => {
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 1,
        inviteId: '11111111-1111-4111-8111-111111111111',
        exp: 1893456000,
      },
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        token: 'legacy-token',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This invitation link must be accepted after signing in.',
    })
  })

  it('marks expired invitations as expired and returns 410', async () => {
    const { supabaseAdmin, groupInvitationsTable } = createSupabaseAdminMock({
      invitation: {
        id: 'invite-1',
        email: 'invitee@example.com',
        status: 'pending',
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    })
    createClientMock.mockReturnValue(supabaseAdmin)
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 2,
        inviteId: 'invite-1',
        inviteeEmail: 'invitee@example.com',
        exp: 1893456000,
      },
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        token: 'signed-token',
        password: 'password123',
      }) as never,
    )

    expect(groupInvitationsTable.update).toHaveBeenCalledWith({ status: 'expired' })
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: 'Invitation has expired.' })
  })

  it('returns 409 when account already exists', async () => {
    const { supabaseAdmin } = createSupabaseAdminMock({
      createUserError: { message: 'User already registered' },
    })
    createClientMock.mockReturnValue(supabaseAdmin)
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 2,
        inviteId: 'invite-1',
        inviteeEmail: 'invitee@example.com',
        exp: 1893456000,
      },
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        token: 'signed-token',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'An account already exists for this email. Please sign in to accept the invite.',
    })
  })

  it('creates a confirmed account and profile for a valid invite', async () => {
    const { supabaseAdmin, profilesTable } = createSupabaseAdminMock()
    createClientMock.mockReturnValue(supabaseAdmin)
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 2,
        inviteId: 'invite-1',
        inviteeEmail: 'invitee@example.com',
        exp: 1893456000,
      },
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeJsonRequest({
        token: 'signed-token',
        password: 'password123',
      }) as never,
    )

    expect(supabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'invitee@example.com',
      password: 'password123',
      email_confirm: true,
    })
    expect(profilesTable.upsert).toHaveBeenCalledWith(
      {
        id: 'user-1',
        email: 'invitee@example.com',
      },
      { onConflict: 'id' },
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
  })
})
