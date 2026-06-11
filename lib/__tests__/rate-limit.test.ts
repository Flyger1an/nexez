import { describe, expect, it } from 'vitest'
import { rateLimit, enforceNegotiationRateLimit, NEGOTIATION_RATE_LIMITS } from '../rate-limit'

const reqFrom = (ip: string) =>
  new Request('https://nexez.test/api/negotiations', { headers: { 'x-forwarded-for': ip } })

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

describe('enforceNegotiationRateLimit (layered IP + page + agent quotas)', () => {
  // Unique slug/agent/IP per test isolate each bucket from the process-wide Map.
  it('trips the per-agent+page quota while IP and page have headroom', () => {
    const slug = `s-${Math.random()}`
    const agent = `a-${Math.random()}`
    const ip = `ip-${Math.random()}`
    const now = 5_000_000
    const fire = () => enforceNegotiationRateLimit(reqFrom(ip), { slug, buyerAgent: agent }, now)
    for (let i = 0; i < NEGOTIATION_RATE_LIMITS.agent.limit; i++) expect(fire()).toBeNull()
    const blocked = fire()
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get('Retry-After')).toBeTruthy()
  })

  it('trips the per-page quota across many distinct agents/IPs', () => {
    const slug = `page-${Math.random()}`
    const now = 6_000_000
    for (let i = 0; i < NEGOTIATION_RATE_LIMITS.page.limit; i++) {
      // Fresh IP + agent each call → only the (shared) page bucket accumulates.
      expect(enforceNegotiationRateLimit(reqFrom(`ip-${i}-${Math.random()}`), { slug, buyerAgent: `ag-${i}` }, now)).toBeNull()
    }
    expect(enforceNegotiationRateLimit(reqFrom(`ip-z-${Math.random()}`), { slug, buyerAgent: 'ag-z' }, now)?.status).toBe(429)
  })

  it('trips the per-IP quota across many distinct pages/agents', () => {
    const ip = `solo-ip-${Math.random()}`
    const now = 7_000_000
    for (let i = 0; i < NEGOTIATION_RATE_LIMITS.ip.limit; i++) {
      // Fresh slug + agent each call → only the (shared) IP bucket accumulates.
      expect(enforceNegotiationRateLimit(reqFrom(ip), { slug: `s-${i}-${Math.random()}`, buyerAgent: `a-${i}` }, now)).toBeNull()
    }
    expect(enforceNegotiationRateLimit(reqFrom(ip), { slug: `s-z-${Math.random()}`, buyerAgent: 'a-z' }, now)?.status).toBe(429)
  })

  it('proceeds (null) when every bucket is under its limit', () => {
    const now = 8_000_000
    expect(enforceNegotiationRateLimit(reqFrom(`ip-${Math.random()}`), { slug: `s-${Math.random()}`, buyerAgent: `a-${Math.random()}` }, now)).toBeNull()
  })
})
