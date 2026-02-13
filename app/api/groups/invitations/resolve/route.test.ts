import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifySignedInviteTokenMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/invites/token', () => ({
  verifySignedInviteToken: verifySignedInviteTokenMock,
}))

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
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 400 for invalid invite token', async () => {
    verifySignedInviteTokenMock.mockReturnValue({ valid: false, reason: 'Invalid token signature.' })

    const { POST } = await import('./route')
    const response = await POST(makeJsonRequest({ token: 'bad-token' }) as never)

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
    const response = await POST(makeJsonRequest({ token: 'legacy-token' }) as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This invitation link must be accepted after signing in.',
    })
  })

  it('returns invitee email for valid v2 tokens', async () => {
    verifySignedInviteTokenMock.mockReturnValue({
      valid: true,
      claims: {
        v: 2,
        inviteId: '11111111-1111-4111-8111-111111111111',
        inviteeEmail: 'invitee@example.com',
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
