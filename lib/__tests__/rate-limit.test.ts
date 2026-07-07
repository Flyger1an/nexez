import { describe, expect, it, vi, afterEach } from 'vitest'
import { rateLimit, rateLimitShared, enforceRateLimit, enforceNegotiationRateLimit, NEGOTIATION_RATE_LIMITS } from '../rate-limit'

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
  it('trips the per-agent+page quota while IP and page have headroom', async () => {
    const slug = `s-${Math.random()}`
    const agent = `a-${Math.random()}`
    const ip = `ip-${Math.random()}`
    const now = 5_000_000
    const fire = () => enforceNegotiationRateLimit(reqFrom(ip), { slug, buyerAgent: agent }, now)
    for (let i = 0; i < NEGOTIATION_RATE_LIMITS.agent.limit; i++) expect(await fire()).toBeNull()
    const blocked = await fire()
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get('Retry-After')).toBeTruthy()
  })

  it('trips the per-page quota across many distinct agents/IPs', async () => {
    const slug = `page-${Math.random()}`
    const now = 6_000_000
    for (let i = 0; i < NEGOTIATION_RATE_LIMITS.page.limit; i++) {
      // Fresh IP + agent each call → only the (shared) page bucket accumulates.
      expect(await enforceNegotiationRateLimit(reqFrom(`ip-${i}-${Math.random()}`), { slug, buyerAgent: `ag-${i}` }, now)).toBeNull()
    }
    expect((await enforceNegotiationRateLimit(reqFrom(`ip-z-${Math.random()}`), { slug, buyerAgent: 'ag-z' }, now))?.status).toBe(429)
  })

  it('trips the per-IP quota across many distinct pages/agents', async () => {
    const ip = `solo-ip-${Math.random()}`
    const now = 7_000_000
    for (let i = 0; i < NEGOTIATION_RATE_LIMITS.ip.limit; i++) {
      // Fresh slug + agent each call → only the (shared) IP bucket accumulates.
      expect(await enforceNegotiationRateLimit(reqFrom(ip), { slug: `s-${i}-${Math.random()}`, buyerAgent: `a-${i}` }, now)).toBeNull()
    }
    expect((await enforceNegotiationRateLimit(reqFrom(ip), { slug: `s-z-${Math.random()}`, buyerAgent: 'a-z' }, now))?.status).toBe(429)
  })

  it('proceeds (null) when every bucket is under its limit', async () => {
    const now = 8_000_000
    expect(await enforceNegotiationRateLimit(reqFrom(`ip-${Math.random()}`), { slug: `s-${Math.random()}`, buyerAgent: `a-${Math.random()}` }, now)).toBeNull()
  })
})

describe('rateLimitShared (Redis/KV REST backend, with in-memory fallback)', () => {
  const realFetch = global.fetch
  afterEach(() => {
    vi.unstubAllEnvs()
    global.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('falls back to the in-memory limiter when no store is configured', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as any
    const r = await rateLimitShared(`shared-${Math.random()}`, 2, 1000, 9_000_000)
    expect(r.ok).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled() // never touches the network without config
  })

  it('blocks (429-worthy) when the Redis counter exceeds the limit', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ result: 3 }, { result: 1 }, { result: 800 }]), { status: 200 }),
    )
    global.fetch = fetchMock as any
    const res = await rateLimitShared('k', 2, 1000)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(res.ok).toBe(false)
    expect(res.retryAfter).toBe(1) // ceil(800ms / 1000)
  })

  it('allows and reports remaining when the Redis counter is within the limit', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify([{ result: 1 }, { result: 1 }, { result: 900 }]), { status: 200 }),
    ) as any
    const res = await rateLimitShared('k', 5, 1000)
    expect(res.ok).toBe(true)
    expect(res.remaining).toBe(4)
  })

  it('fails OPEN to the in-memory limiter when the store errors', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as any
    const res = await rateLimitShared(`failopen-${Math.random()}`, 1, 1000, 10_000_000)
    expect(res.ok).toBe(true) // first hit allowed by the in-memory fallback
  })

  it('fails CLOSED (denies) when the store errors and failClosed is set', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as any
    const res = await rateLimitShared(`failclosed-${Math.random()}`, 1, 1000, 10_500_000, { failClosed: true })
    expect(res.ok).toBe(false)
    expect(res.retryAfter).toBeGreaterThanOrEqual(1)
  })

  it('failClosed does NOT deny when no store is configured (in-memory path)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    const res = await rateLimitShared(`fc-noconfig-${Math.random()}`, 2, 1000, 10_700_000, { failClosed: true })
    expect(res.ok).toBe(true) // unconfigured is not an outage - must stay available
  })
})

describe('enforceRateLimit (per-subject keying)', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('keys by subject so distinct identities get independent buckets (not the shared IP)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '') // force in-memory
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const route = `r-${Math.random()}`
    const sameIp = new Request('https://nexez.test/x', { headers: { 'x-forwarded-for': 'shared-ip' } })
    // limit 1/window: two DIFFERENT subjects from the same IP both pass (separate buckets).
    expect(await enforceRateLimit(sameIp, route, 1, 60_000, { subject: `userA-${Math.random()}` })).toBeNull()
    expect(await enforceRateLimit(sameIp, route, 1, 60_000, { subject: `userB-${Math.random()}` })).toBeNull()
    // the SAME subject's second hit trips the limit.
    const subj = `userC-${Math.random()}`
    expect(await enforceRateLimit(sameIp, route, 1, 60_000, { subject: subj })).toBeNull()
    expect((await enforceRateLimit(sameIp, route, 1, 60_000, { subject: subj }))?.status).toBe(429)
  })
})
