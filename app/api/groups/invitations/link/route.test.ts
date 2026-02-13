import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.hoisted(() => vi.fn())
const cookiesMock = vi.hoisted(() => vi.fn())
const assertCanManageGroupInvitesMock = vi.hoisted(() => vi.fn())
const resolveAppOriginMock = vi.hoisted(() => vi.fn())
const createSignedInviteTokenMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/invites/server', () => ({
  assertCanManageGroupInvites: assertCanManageGroupInvitesMock,
  resolveAppOrigin: resolveAppOriginMock,
}))

vi.mock('@/lib/invites/token', () => ({
  createSignedInviteToken: createSignedInviteTokenMock,
}))

type Group = {
  id: string
  name: string
  owner_id: string
}

type Invitation = {
  id: string
  group_id: string
  email: string
  status: string
  expires_at: string | null
  invited_by: string
}

type SupabaseOptions = {
  sessionUser?: { id: string; email?: string | null } | null
  invitation?: Invitation | null
  invitationError?: { message: string } | null
  expireError?: { message: string } | null
}

function createSupabaseMock(options: SupabaseOptions = {}) {
  const invitation = options.invitation === undefined ? {
    id: 'invite-1',
    group_id: 'group-1',
    email: 'invitee@example.com',
    status: 'pending',
    expires_at: '2030-01-01T00:00:00.000Z',
    invited_by: 'owner-1',
  } : options.invitation

  const groupInvitationsSelectBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: invitation,
      error: options.invitationError ?? null,
    }),
  }

  const groupInvitationsTable = {
    select: vi.fn().mockReturnValue(groupInvitationsSelectBuilder),
    update: vi.fn().mockImplementation(() => {
      let eqCalls = 0
      const builder = {
        eq: vi.fn().mockImplementation(() => {
          eqCalls += 1
          if (eqCalls >= 2) {
            return Promise.resolve({ error: options.expireError ?? null })
          }
          return builder
        }),
      }
      return builder
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

function makeJsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/groups/invitations/link', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/groups/invitations/link', () => {
  const group: Group = {
    id: 'group-1',
    name: 'Family Meals',
    owner_id: 'owner-1',
  }
  const baseBody = {
    groupId: '11111111-1111-4111-8111-111111111111',
    inviteId: '22222222-2222-4222-8222-222222222222',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    cookiesMock.mockResolvedValue({})
    resolveAppOriginMock.mockReturnValue('https://app.example.com')
    createSignedInviteTokenMock.mockReturnValue('signed+token')
    assertCanManageGroupInvitesMock.mockResolvedValue(group)
  })

  it('returns 401 for unauthenticated requests', async () => {
    const { supabase } = createSupabaseMock({ sessionUser: null })
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest(baseBody) as never)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 when user cannot manage invites for the group', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)
    assertCanManageGroupInvitesMock.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest(baseBody) as never)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden: you cannot manage invites for this group.',
    })
  })

  it('returns 404 when invitation does not exist', async () => {
    const { supabase } = createSupabaseMock({ invitation: null })
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest(baseBody) as never)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Invitation not found.' })
  })

  it('marks expired pending invitations and returns 410', async () => {
    const { supabase, groupInvitationsTable } = createSupabaseMock({
      invitation: {
        id: 'invite-1',
        group_id: 'group-1',
        email: 'invitee@example.com',
        status: 'pending',
        expires_at: '2020-01-01T00:00:00.000Z',
        invited_by: 'owner-1',
      },
    })
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest(baseBody) as never)

    expect(groupInvitationsTable.update).toHaveBeenCalledWith({ status: 'expired' })
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: 'Invitation has expired.' })
  })

  it('returns invite URL for active pending invitations', async () => {
    const { supabase } = createSupabaseMock()
    createRouteHandlerClientMock.mockReturnValue(supabase)

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest(baseBody) as never)

    expect(createSignedInviteTokenMock).toHaveBeenCalledWith({
      inviteId: 'invite-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      inviteUrl: 'https://app.example.com/groups/accept-invite?token=signed%2Btoken',
      invitation: {
        id: 'invite-1',
        email: 'invitee@example.com',
        expires_at: '2030-01-01T00:00:00.000Z',
        status: 'pending',
      },
    })
  })
})
