import { describe, expect, it } from 'vitest'
import { hasRecentInteractiveAuthentication, RECENT_AUTH_WINDOW_SECONDS } from './auth-recent'

describe('hasRecentInteractiveAuthentication', () => {
  const now = 2_000_000_000

  it.each(['password', 'oauth', 'otp', 'totp', 'recovery', 'passkey'])(
    'accepts a recent %s authentication method',
    (method) => {
      expect(hasRecentInteractiveAuthentication({ amr: [{ method, timestamp: now - 30 }] }, now)).toBe(true)
    },
  )

  it('rejects a refreshed token whose only interactive authentication is stale', () => {
    expect(hasRecentInteractiveAuthentication({
      iat: now,
      amr: [
        { method: 'password', timestamp: now - RECENT_AUTH_WINDOW_SECONDS - 1 },
        { method: 'token_refresh', timestamp: now },
      ],
    }, now)).toBe(false)
  })

  it.each([
    null,
    {},
    { amr: 'password' },
    { amr: [{ method: 'anonymous', timestamp: now }] },
    { amr: [{ method: 'password', timestamp: 'now' }] },
    { amr: [{ method: 'password', timestamp: now + 61 }] },
  ])('fails closed for malformed or non-interactive claims', (claims) => {
    expect(hasRecentInteractiveAuthentication(claims, now)).toBe(false)
  })
})
