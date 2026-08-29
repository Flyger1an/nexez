import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto'
import { normalizeE164PhoneNumber } from '@/lib/phone-auth'

const CHALLENGE_VERSION = 'v1'
const CHALLENGE_AAD = Buffer.from('nexez:sms-login-challenge:v1')
const CHALLENGE_LIFETIME_MS = 10 * 60_000
const SECRET_MIN_LENGTH = 32
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000'
const PADDED_PHONE_LENGTH = 16

type ChallengePayload = {
  v: 1
  userId: string
  phone: string
  issuedAt: number
  expiresAt: number
  nonce: string
}

export type SmsLoginChallenge = {
  userId: string | null
  phone: string | null
}

function challengeSecret(): string | null {
  const secret = process.env.NEXEZ_SMS_RATE_LIMIT_SECRET?.trim()
  return secret && secret.length >= SECRET_MIN_LENGTH ? secret : null
}

function encryptionKey(secret: string): Buffer {
  return createHash('sha256')
    .update('nexez:sms-login-challenge-key:v1\0')
    .update(secret)
    .digest()
}

function hasOnlyPayloadKeys(value: Record<string, unknown>): boolean {
  const expected = ['v', 'userId', 'phone', 'issuedAt', 'expiresAt', 'nonce']
  return Object.keys(value).length === expected.length
    && Object.keys(value).every((key) => expected.includes(key))
}

export function isSmsLoginChallengeConfigured(): boolean {
  return challengeSecret() !== null
}

export function createSmsLoginChallenge(
  account: { userId: string; phone: string } | null,
  now: number = Date.now(),
): string | null {
  const secret = challengeSecret()
  if (!secret) return null

  const phone = account ? normalizeE164PhoneNumber(account.phone) : null
  if (account && (!UUID.test(account.userId) || !phone)) return null

  const payload: ChallengePayload = {
    v: 1,
    userId: account?.userId ?? DUMMY_USER_ID,
    phone: (phone ?? '').padEnd(PADDED_PHONE_LENGTH, ' '),
    issuedAt: now,
    expiresAt: now + CHALLENGE_LIFETIME_MS,
    nonce: randomBytes(16).toString('base64url'),
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  cipher.setAAD(CHALLENGE_AAD)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [CHALLENGE_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function readSmsLoginChallenge(
  challenge: string,
  now: number = Date.now(),
): SmsLoginChallenge | null {
  const secret = challengeSecret()
  if (!secret || challenge.length > 1_024) return null

  const parts = challenge.split('.')
  if (parts.length !== 4 || parts[0] !== CHALLENGE_VERSION) return null

  try {
    const iv = Buffer.from(parts[1]!, 'base64url')
    const tag = Buffer.from(parts[2]!, 'base64url')
    const ciphertext = Buffer.from(parts[3]!, 'base64url')
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null

    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv)
    decipher.setAAD(CHALLENGE_AAD)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plaintext) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

    const payload = parsed as Record<string, unknown>
    if (!hasOnlyPayloadKeys(payload)
      || payload.v !== 1
      || typeof payload.issuedAt !== 'number'
      || typeof payload.expiresAt !== 'number'
      || typeof payload.nonce !== 'string'
      || !/^[A-Za-z0-9_-]{22}$/.test(payload.nonce)
      || payload.issuedAt > now + 60_000
      || payload.expiresAt <= now
      || payload.expiresAt !== payload.issuedAt + CHALLENGE_LIFETIME_MS) {
      return null
    }

    if (typeof payload.userId !== 'string'
      || typeof payload.phone !== 'string'
      || payload.phone.length !== PADDED_PHONE_LENGTH) return null
    const unpaddedPhone = payload.phone.trimEnd()
    if (payload.userId === DUMMY_USER_ID && unpaddedPhone === '') return { userId: null, phone: null }
    if (!UUID.test(payload.userId) || unpaddedPhone.length === 0) return null
    const phone = normalizeE164PhoneNumber(unpaddedPhone)
    return phone ? { userId: payload.userId, phone } : null
  } catch {
    return null
  }
}

export function smsLoginRateLimitSubject(kind: 'email' | 'challenge', value: string): string | null {
  const secret = challengeSecret()
  if (!secret) return null
  return createHmac('sha256', secret)
    .update(`nexez:sms-login:${kind}:${value}`)
    .digest('base64url')
}
