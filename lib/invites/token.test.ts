import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignedInviteToken, verifySignedInviteToken } from './token'

const INVITE_ID = '11111111-1111-4111-8111-111111111111'
const INVITEE_EMAIL = 'invitee@example.com'
const SECRET = 'this-is-a-very-long-secret-key-for-tests'

describe('invite token signing', () => {
  const originalSecret = process.env.INVITE_TOKEN_SECRET

  beforeEach(() => {
    process.env.INVITE_TOKEN_SECRET = SECRET
    vi.useRealTimers()
  })

  afterEach(() => {
    process.env.INVITE_TOKEN_SECRET = originalSecret
    vi.useRealTimers()
  })

  it('creates a token that verifies successfully', () => {
    const token = createSignedInviteToken({
      inviteId: INVITE_ID,
      inviteeEmail: INVITEE_EMAIL,
      expiresAt: '2030-01-01T00:00:00.000Z',
    })

    const result = verifySignedInviteToken(token)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.claims.inviteId).toBe(INVITE_ID)
      expect(result.claims.v).toBe(2)
      expect(result.claims).toMatchObject({
        inviteeEmail: INVITEE_EMAIL,
      })
    }
  })

  it('uses fallback ttl when expiresAt is missing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))

    const token = createSignedInviteToken({
      inviteId: INVITE_ID,
      inviteeEmail: INVITEE_EMAIL,
      expiresAt: null,
    })

    const [payloadSegment] = token.split('.')
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as { exp: number }

    expect(payload.exp).toBe(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60)
  })

  it('rejects malformed tokens', () => {
    const result = verifySignedInviteToken('not-a-token')

    expect(result).toEqual({ valid: false, reason: 'Malformed token.' })
  })

  it('rejects tampered signatures', () => {
    const token = createSignedInviteToken({
      inviteId: INVITE_ID,
      inviteeEmail: INVITEE_EMAIL,
      expiresAt: '2030-01-01T00:00:00.000Z',
    })

    const [payloadSegment] = token.split('.')
    const result = verifySignedInviteToken(`${payloadSegment}.tampered-signature`)

    expect(result).toEqual({ valid: false, reason: 'Invalid token signature.' })
  })

  it('rejects expired tokens', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))

    const token = createSignedInviteToken({
      inviteId: INVITE_ID,
      inviteeEmail: INVITEE_EMAIL,
      expiresAt: '2025-01-01T00:00:05.000Z',
    })

    vi.setSystemTime(new Date('2025-01-01T00:00:06.000Z'))

    const result = verifySignedInviteToken(token)

    expect(result).toEqual({ valid: false, reason: 'Token has expired.' })
  })

  it('accepts legacy v1 tokens without invitee email', () => {
    const payloadSegment = Buffer.from(
      JSON.stringify({
        v: 1,
        inviteId: INVITE_ID,
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
      'utf8',
    ).toString('base64url')
    const signature = crypto.createHmac('sha256', SECRET).update(payloadSegment).digest('base64url')

    const result = verifySignedInviteToken(`${payloadSegment}.${signature}`)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.claims).toMatchObject({
        v: 1,
        inviteId: INVITE_ID,
      })
    }
  })

  it('throws when invite secret is missing or too short', () => {
    process.env.INVITE_TOKEN_SECRET = 'too-short'

    expect(() =>
      createSignedInviteToken({
        inviteId: INVITE_ID,
        inviteeEmail: INVITEE_EMAIL,
        expiresAt: '2030-01-01T00:00:00.000Z',
      }),
    ).toThrow('INVITE_TOKEN_SECRET must be set and at least 32 characters long.')
  })
})
