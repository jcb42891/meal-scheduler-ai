import 'server-only'

import crypto from 'crypto'
import { z } from 'zod'

const INVITE_TOKEN_VERSION = 2
const INVITE_FALLBACK_TTL_SECONDS = 7 * 24 * 60 * 60
const MIN_INVITE_TOKEN_SECRET_LENGTH = 32

const legacyInviteTokenClaimsSchema = z.object({
  v: z.literal(1),
  inviteId: z.string().uuid(),
  exp: z.number().int().positive(),
})

const inviteTokenClaimsSchema = z.object({
  v: z.literal(INVITE_TOKEN_VERSION),
  inviteId: z.string().uuid(),
  inviteeEmail: z.string().email(),
  exp: z.number().int().positive(),
})

type InviteTokenClaims = z.infer<typeof inviteTokenClaimsSchema>
type LegacyInviteTokenClaims = z.infer<typeof legacyInviteTokenClaimsSchema>
type VerifiableInviteTokenClaims = InviteTokenClaims | LegacyInviteTokenClaims

type CreateInviteTokenInput = {
  inviteId: string
  inviteeEmail: string
  expiresAt: string | Date | null | undefined
}

function getInviteTokenSecret() {
  const secret = process.env.INVITE_TOKEN_SECRET
  if (!secret || secret.length < MIN_INVITE_TOKEN_SECRET_LENGTH) {
    throw new Error('INVITE_TOKEN_SECRET must be set and at least 32 characters long.')
  }

  return secret
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signPayloadSegment(payloadSegment: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payloadSegment).digest('base64url')
}

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

function toUnixSeconds(expiresAt: CreateInviteTokenInput['expiresAt']) {
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return Math.floor(Date.now() / 1000) + INVITE_FALLBACK_TTL_SECONDS
  }

  return Math.floor(expiresAtMs / 1000)
}

export function createSignedInviteToken(input: CreateInviteTokenInput) {
  const normalizedInviteeEmail = input.inviteeEmail.trim().toLowerCase()
  const claims: InviteTokenClaims = {
    v: INVITE_TOKEN_VERSION,
    inviteId: input.inviteId,
    inviteeEmail: normalizedInviteeEmail,
    exp: toUnixSeconds(input.expiresAt),
  }

  const payloadSegment = toBase64Url(JSON.stringify(claims))
  const signature = signPayloadSegment(payloadSegment, getInviteTokenSecret())

  return `${payloadSegment}.${signature}`
}

type VerifyInviteTokenResult =
  | { valid: true; claims: VerifiableInviteTokenClaims }
  | { valid: false; reason: string }

export function verifySignedInviteToken(token: string): VerifyInviteTokenResult {
  const [payloadSegment, signature] = token.split('.')
  if (!payloadSegment || !signature || token.split('.').length !== 2) {
    return { valid: false, reason: 'Malformed token.' }
  }

  const secret = getInviteTokenSecret()
  const expectedSignature = signPayloadSegment(payloadSegment, secret)
  if (!signaturesMatch(expectedSignature, signature)) {
    return { valid: false, reason: 'Invalid token signature.' }
  }

  let parsedClaims: VerifiableInviteTokenClaims
  try {
    parsedClaims = z
      .union([inviteTokenClaimsSchema, legacyInviteTokenClaimsSchema])
      .parse(JSON.parse(fromBase64Url(payloadSegment)))
  } catch {
    return { valid: false, reason: 'Malformed token payload.' }
  }

  if (parsedClaims.exp <= Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'Token has expired.' }
  }

  return { valid: true, claims: parsedClaims }
}

