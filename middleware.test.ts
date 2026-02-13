import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const createMiddlewareClientMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}))

function mockSession(session: { user: { id: string } } | null) {
  createMiddlewareClientMock.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session },
      }),
    },
  })
}

describe('middleware auth protection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('allows unauthenticated access to /groups/accept-invite', async () => {
    mockSession(null)

    const { middleware } = await import('./middleware')
    const response = await middleware(new NextRequest('http://localhost/groups/accept-invite?token=abc'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('allows unauthenticated access to /api/groups/invitations/resolve', async () => {
    mockSession(null)

    const { middleware } = await import('./middleware')
    const response = await middleware(new NextRequest('http://localhost/api/groups/invitations/resolve'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('allows unauthenticated access to /api/groups/invitations/claim-account', async () => {
    mockSession(null)

    const { middleware } = await import('./middleware')
    const response = await middleware(new NextRequest('http://localhost/api/groups/invitations/claim-account'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects unauthenticated users for protected pages', async () => {
    mockSession(null)

    const { middleware } = await import('./middleware')
    const response = await middleware(new NextRequest('http://localhost/groups'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth?next=%2Fgroups')
  })

  it('returns 401 for protected invitation APIs when unauthenticated', async () => {
    mockSession(null)

    const { middleware } = await import('./middleware')
    const response = await middleware(new NextRequest('http://localhost/api/groups/invitations/accept'))

    expect(response.status).toBe(401)
  })
})
