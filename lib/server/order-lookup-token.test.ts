import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signLookupToken, verifyLookupToken } from './order-lookup-token'

const NOW = 1_800_000_000_000

describe('order-lookup-token', () => {
  beforeEach(() => vi.stubEnv('ORDER_LOOKUP_SECRET', 'test-secret-abc'))
  afterEach(() => vi.unstubAllEnvs())

  it('round-trips a valid, unexpired token back to the (lowercased) email', () => {
    const tok = signLookupToken('Buyer@Example.com', 60_000, NOW)!
    expect(tok).toContain('.')
    expect(verifyLookupToken(tok, NOW + 1000)).toBe('buyer@example.com')
  })

  it('rejects an expired token', () => {
    const tok = signLookupToken('buyer@example.com', 60_000, NOW)!
    expect(verifyLookupToken(tok, NOW + 60_001)).toBeNull()
  })

  it('rejects a tampered payload (signature mismatch)', () => {
    const tok = signLookupToken('buyer@example.com', 60_000, NOW)!
    const [, sig] = tok.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ e: 'attacker@evil.com', x: NOW + 60_000 })).toString('base64url')
    expect(verifyLookupToken(`${forgedPayload}.${sig}`, NOW)).toBeNull()
  })

  it('rejects garbage / missing-dot tokens', () => {
    expect(verifyLookupToken('', NOW)).toBeNull()
    expect(verifyLookupToken('nodot', NOW)).toBeNull()
    expect(verifyLookupToken('.', NOW)).toBeNull()
    expect(verifyLookupToken('a.b', NOW)).toBeNull()
  })

  it('does not verify across a different signing secret', () => {
    const tok = signLookupToken('buyer@example.com', 60_000, NOW)!
    vi.stubEnv('ORDER_LOOKUP_SECRET', 'a-totally-different-secret')
    expect(verifyLookupToken(tok, NOW + 1000)).toBeNull()
  })

  it('returns null when no signing key is configured', () => {
    vi.unstubAllEnvs()
    vi.stubEnv('ORDER_LOOKUP_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(signLookupToken('buyer@example.com')).toBeNull()
    expect(verifyLookupToken('anything.here', NOW)).toBeNull()
  })

  it('falls back to the service-role key when no dedicated secret is set', () => {
    vi.unstubAllEnvs()
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-xyz')
    const tok = signLookupToken('buyer@example.com', 60_000, NOW)!
    expect(verifyLookupToken(tok, NOW + 1000)).toBe('buyer@example.com')
  })
})
