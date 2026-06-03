import { describe, expect, it } from 'vitest'
import { rateLimit } from '../rate-limit'

describe('rateLimit', () => {
  it('allows up to the limit then blocks within the window', () => {
    const key = `test-${Math.random()}`
    const t0 = 1_000_000
    expect(rateLimit(key, 3, 1000, t0).ok).toBe(true)
    expect(rateLimit(key, 3, 1000, t0).ok).toBe(true)
    expect(rateLimit(key, 3, 1000, t0).ok).toBe(true)
    const blocked = rateLimit(key, 3, 1000, t0)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1)
  })
  it('resets after the window', () => {
    const key = `test-${Math.random()}`
    const t0 = 2_000_000
    rateLimit(key, 1, 1000, t0)
    expect(rateLimit(key, 1, 1000, t0).ok).toBe(false)
    expect(rateLimit(key, 1, 1000, t0 + 1001).ok).toBe(true)
  })
})
