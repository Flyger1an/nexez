import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSmsLoginChallenge,
  readSmsLoginChallenge,
  smsLoginRateLimitSubject,
} from './sms-login-challenge'

const ACCOUNT = {
  userId: '3d62674e-a8b2-4d2a-9f99-d4a2b4589143',
  phone: '+442071838750',
}
const NOW = Date.parse('2026-08-28T12:00:00Z')

beforeEach(() => {
  vi.stubEnv('NEXEZ_SMS_RATE_LIMIT_SECRET', 'a-very-long-random-rate-limit-secret-for-tests')
})

afterEach(() => vi.unstubAllEnvs())

describe('SMS login challenges', () => {
  it('round-trips an encrypted account challenge without exposing identifiers', () => {
    const challenge = createSmsLoginChallenge(ACCOUNT, NOW)

    expect(challenge).toBeTruthy()
    expect(challenge).not.toContain(ACCOUNT.userId)
    expect(challenge).not.toContain(ACCOUNT.phone)
    expect(readSmsLoginChallenge(challenge!, NOW + 60_000)).toEqual(ACCOUNT)
  })

  it('creates indistinguishable dummy challenges for unknown emails', () => {
    const challenge = createSmsLoginChallenge(null, NOW)
    const accountChallenge = createSmsLoginChallenge(ACCOUNT, NOW)

    expect(challenge).toMatch(/^v1\./)
    expect(challenge).toHaveLength(accountChallenge!.length)
    expect(readSmsLoginChallenge(challenge!, NOW + 60_000)).toEqual({ userId: null, phone: null })
  })

  it('rejects expired, tampered, and incorrectly configured challenges', () => {
    const challenge = createSmsLoginChallenge(ACCOUNT, NOW)!

    expect(readSmsLoginChallenge(challenge, NOW + 10 * 60_000)).toBeNull()
    expect(readSmsLoginChallenge(`${challenge.slice(0, -1)}x`, NOW + 60_000)).toBeNull()
    vi.stubEnv('NEXEZ_SMS_RATE_LIMIT_SECRET', 'too-short')
    expect(readSmsLoginChallenge(challenge, NOW + 60_000)).toBeNull()
  })

  it('hashes rate-limit identities with domain separation', () => {
    const emailSubject = smsLoginRateLimitSubject('email', 'person@example.com')
    const challengeSubject = smsLoginRateLimitSubject('challenge', 'person@example.com')

    expect(emailSubject).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(challengeSubject).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(emailSubject).not.toBe(challengeSubject)
    expect(emailSubject).not.toContain('person@example.com')
  })
})
