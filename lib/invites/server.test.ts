import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertCanManageGroupInvites,
  checkExistingGroupMemberForEmail,
  normalizeEmailAddress,
  resolveAppOrigin,
  sendInviteEmailUsingEdgeFunction,
} from './server'

function createSelectBuilder(result: { data: unknown; error: unknown }) {
  return {
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

describe('normalizeEmailAddress', () => {
  it('trims and lowercases emails', () => {
    expect(normalizeEmailAddress('  PERSON@Example.COM  ')).toBe('person@example.com')
  })
})

describe('resolveAppOrigin', () => {
  const originalInviteAppOrigin = process.env.INVITE_APP_ORIGIN
  const originalAllowOverride = process.env.INVITE_APP_ORIGIN_ALLOW_DEV_OVERRIDE

  beforeEach(() => {
    delete process.env.INVITE_APP_ORIGIN
    delete process.env.INVITE_APP_ORIGIN_ALLOW_DEV_OVERRIDE
  })

  afterEach(() => {
    process.env.INVITE_APP_ORIGIN = originalInviteAppOrigin
    process.env.INVITE_APP_ORIGIN_ALLOW_DEV_OVERRIDE = originalAllowOverride
  })

  it('uses request origin by default', () => {
    const request = {
      nextUrl: new URL('https://runtime.example.com/groups'),
    }

    expect(resolveAppOrigin(request as never)).toBe('https://runtime.example.com')
  })

  it('uses configured origin when request is not localhost', () => {
    process.env.INVITE_APP_ORIGIN = 'https://app.example.com'

    const request = {
      nextUrl: new URL('https://staging.example.com/groups'),
    }

    expect(resolveAppOrigin(request as never)).toBe('https://app.example.com')
  })

  it('prefers localhost request origin unless override is enabled', () => {
    process.env.INVITE_APP_ORIGIN = 'https://app.example.com'
    const localhostRequest = {
      nextUrl: new URL('http://localhost:3000/groups'),
    }

    expect(resolveAppOrigin(localhostRequest as never)).toBe('http://localhost:3000')

    process.env.INVITE_APP_ORIGIN_ALLOW_DEV_OVERRIDE = 'true'

    expect(resolveAppOrigin(localhostRequest as never)).toBe('https://app.example.com')
  })

  it('throws when configured origin is invalid', () => {
    process.env.INVITE_APP_ORIGIN = 'not-a-valid-url'

    const request = {
      nextUrl: new URL('https://runtime.example.com/groups'),
    }

    expect(() => resolveAppOrigin(request as never)).toThrow('INVITE_APP_ORIGIN must be a valid absolute URL.')
  })
})

describe('assertCanManageGroupInvites', () => {
  it('returns group when user is group owner', async () => {
    const groupRow = { id: 'group-1', name: 'Family', owner_id: 'owner-1' }
    const groupsBuilder = createSelectBuilder({ data: groupRow, error: null })
    const membersBuilder = createSelectBuilder({ data: null, error: null })
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'groups') return { select: vi.fn().mockReturnValue(groupsBuilder) }
        if (table === 'group_members') return { select: vi.fn().mockReturnValue(membersBuilder) }
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const result = await assertCanManageGroupInvites(supabase as never, 'group-1', 'owner-1')

    expect(result).toEqual(groupRow)
  })

  it('returns null when user is not owner and not a member', async () => {
    const groupsBuilder = createSelectBuilder({
      data: { id: 'group-1', name: 'Family', owner_id: 'owner-1' },
      error: null,
    })
    const membersBuilder = createSelectBuilder({ data: null, error: null })
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'groups') return { select: vi.fn().mockReturnValue(groupsBuilder) }
        if (table === 'group_members') return { select: vi.fn().mockReturnValue(membersBuilder) }
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const result = await assertCanManageGroupInvites(supabase as never, 'group-1', 'someone-else')

    expect(result).toBeNull()
  })
})

describe('checkExistingGroupMemberForEmail', () => {
  it('returns non-member when profile does not exist', async () => {
    const profilesBuilder = createSelectBuilder({ data: null, error: null })
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') return { select: vi.fn().mockReturnValue(profilesBuilder) }
        if (table === 'group_members') return { select: vi.fn().mockReturnValue(createSelectBuilder({ data: null, error: null })) }
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const result = await checkExistingGroupMemberForEmail(
      supabase as never,
      'group-1',
      'owner-1',
      'invitee@example.com',
    )

    expect(result).toEqual({ isMember: false, profileId: null })
  })

  it('returns member when invited profile matches owner id', async () => {
    const profilesBuilder = createSelectBuilder({ data: { id: 'owner-1' }, error: null })
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') return { select: vi.fn().mockReturnValue(profilesBuilder) }
        if (table === 'group_members') return { select: vi.fn().mockReturnValue(createSelectBuilder({ data: null, error: null })) }
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const result = await checkExistingGroupMemberForEmail(
      supabase as never,
      'group-1',
      'owner-1',
      'owner@example.com',
    )

    expect(result).toEqual({ isMember: true, profileId: 'owner-1' })
  })

  it('returns membership status when invited profile exists', async () => {
    const profilesBuilder = createSelectBuilder({ data: { id: 'user-2' }, error: null })
    const membersBuilder = createSelectBuilder({ data: { user_id: 'user-2' }, error: null })
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') return { select: vi.fn().mockReturnValue(profilesBuilder) }
        if (table === 'group_members') return { select: vi.fn().mockReturnValue(membersBuilder) }
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const result = await checkExistingGroupMemberForEmail(
      supabase as never,
      'group-1',
      'owner-1',
      'invitee@example.com',
    )

    expect(result).toEqual({ isMember: true, profileId: 'user-2' })
  })
})

describe('sendInviteEmailUsingEdgeFunction', () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalInviteSecret = process.env.INVITE_FUNCTION_SECRET

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com'
    process.env.INVITE_FUNCTION_SECRET = 'secret-key'
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
    process.env.INVITE_FUNCTION_SECRET = originalInviteSecret
    vi.unstubAllGlobals()
  })

  it('returns provider metadata on successful function response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            provider: 'resend',
            id: 'message-123',
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await sendInviteEmailUsingEdgeFunction({
      toEmail: 'invitee@example.com',
      groupName: 'Family Meals',
      inviterEmail: 'owner@example.com',
      inviteUrl: 'https://app.example.com/invite',
      expiresAt: '2030-01-01T00:00:00.000Z',
    })

    expect(result).toEqual({
      provider: 'resend',
      externalMessageId: 'message-123',
    })
  })

  it('throws a descriptive error when the edge function returns a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Delivery failed',
          }),
          { status: 500 },
        ),
      ),
    )

    await expect(
      sendInviteEmailUsingEdgeFunction({
        toEmail: 'invitee@example.com',
        groupName: 'Family Meals',
        inviterEmail: 'owner@example.com',
        inviteUrl: 'https://app.example.com/invite',
        expiresAt: '2030-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('Delivery failed')
  })
})
