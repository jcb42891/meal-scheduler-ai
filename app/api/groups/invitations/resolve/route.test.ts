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

  const supabaseAdmin = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'group_invitations') return groupInvitationsTable
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return {
    supabaseAdmin,
    groupInvitationsTable,
  }
}

function makeJsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/groups/invitations/resolve', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/groups/invitations/resolve', () => {
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

  it('returns 400 for invalid invite token', async () => {
    verifySignedInviteTokenMock.mockReturnValue({ valid: false, reason: 'Invalid token signature.' })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'bad-token' }) as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired invitation link.' })
  })

  it('returns 404 when invitation does not exist', async () => {
    const { supabaseAdmin } = createSupabaseAdminMock({ invitation: null })
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
    const response = await POST(makeJsonRequest({ token: 'valid-token' }) as never)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Invitation not found.',
      code: 'invite_not_found',
    })
  })

  it('returns 409 when invitation is no longer pending', async () => {
    const { supabaseAdmin } = createSupabaseAdminMock({
      invitation: {
        id: 'invite-1',
        email: 'invitee@example.com',
        status: 'accepted',
        expires_at: '2030-01-01T00:00:00.000Z',
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
    const response = await POST(makeJsonRequest({ token: 'used-token' }) as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Invitation has already been used or is no longer valid.',
      code: 'invite_not_pending',
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
    const response = await POST(makeJsonRequest({ token: 'expired-token' }) as never)

    expect(groupInvitationsTable.update).toHaveBeenCalledWith({ status: 'expired' })
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({
      error: 'Invitation has expired.',
      code: 'invite_expired',
    })
  })

  it('returns 409 for legacy tokens without invitee email when invite is still pending', async () => {
    const { supabaseAdmin } = createSupabaseAdminMock()
    createClientMock.mockReturnValue(supabaseAdmin)
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 1,
        inviteId: 'invite-1',
        exp: 1893456000,
      },
    })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'legacy-token' }) as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This invitation link must be accepted after signing in.',
      code: 'requires_sign_in',
    })
  })

  it('returns 400 when token email does not match invite email', async () => {
    const { supabaseAdmin } = createSupabaseAdminMock({
      invitation: {
        id: 'invite-1',
        email: 'invitee@example.com',
        status: 'pending',
        expires_at: '2030-01-01T00:00:00.000Z',
      },
    })
    createClientMock.mockReturnValue(supabaseAdmin)
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 2,
        inviteId: 'invite-1',
        inviteeEmail: 'someone-else@example.com',
        exp: 1893456000,
      },
    })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'wrong-email-token' }) as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired invitation link.' })
  })

  it('returns invitee email for valid v2 tokens with pending invite', async () => {
    const { supabaseAdmin } = createSupabaseAdminMock({
      invitation: {
        id: 'invite-1',
        email: 'Invitee@Example.com',
        status: 'pending',
        expires_at: '2030-01-01T00:00:00.000Z',
      },
    })
    createClientMock.mockReturnValue(supabaseAdmin)
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 2,
        inviteId: 'invite-1',
        inviteeEmail: 'INVITEE@example.com',
        exp: 1893456000,
      },
    })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'valid-token' }) as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      inviteeEmail: 'invitee@example.com',
    })
  })
})
