import { describe, it, expect, vi, beforeEach } from 'vitest'

const refs = vi.hoisted(() => ({
  ipLimited: null as any, // Response when IP-limited, else null
  perEmailOk: true,
  orders: [] as any[],
  token: 'signed.tok' as string | null,
  sent: [] as any[],
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  // Run after() callbacks immediately (fire-and-forget) so we can flush + assert.
  return { ...actual, after: (fn: () => Promise<void>) => { void fn() } }
})
vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => refs.ipLimited),
  rateLimitShared: vi.fn(async () => ({ ok: refs.perEmailOk, remaining: 0, retryAfter: 0, limit: 3 })),
}))
vi.mock('../../../../lib/server/load-order', () => ({ findOrdersByEmail: vi.fn(async () => refs.orders) }))
vi.mock('../../../../lib/server/order-lookup-token', () => ({ signLookupToken: vi.fn(() => refs.token) }))
vi.mock('../../../../lib/email', () => ({
  hasEmailEnv: vi.fn(() => true),
  sendEmail: vi.fn(async (m: any) => { refs.sent.push(m) }),
  buildOrderLookupEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
}))
vi.mock('../../../../lib/agent-page', () => ({ getBaseUrl: () => 'https://nexez.app' }))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.app/api/order-portal/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('POST /api/order-portal/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.ipLimited = null
    refs.perEmailOk = true
    refs.orders = []
    refs.token = 'signed.tok'
    refs.sent = []
  })

  it('400 when no email is provided', async () => {
    expect((await POST(post({}))).status).toBe(400)
  })

  it('returns the SAME neutral response whether or not orders exist (anti-enumeration)', async () => {
    refs.orders = [{ token: 'a' }]
    const withOrders = await (await POST(post({ email: 'has@example.com' }))).json()
    refs.orders = []
    const without = await (await POST(post({ email: 'none@example.com' }))).json()
    expect(withOrders).toEqual(without)
    expect(withOrders.ok).toBe(true)
  })

  it('emails the link ONLY when orders actually match', async () => {
    refs.orders = [{ token: 'a' }, { token: 'b' }]
    await POST(post({ email: 'has@example.com' }))
    await flush()
    expect(refs.sent).toHaveLength(1)
    expect(refs.sent[0].to).toBe('has@example.com')
  })

  it('never emails a non-customer address (no matched orders)', async () => {
    refs.orders = []
    await POST(post({ email: 'stranger@example.com' }))
    await flush()
    expect(refs.sent).toHaveLength(0)
  })

  it('skips the send (but stays neutral) when the per-email cap is hit', async () => {
    refs.perEmailOk = false
    refs.orders = [{ token: 'a' }]
    const res = await POST(post({ email: 'spammed@example.com' }))
    await flush()
    expect((await res.json()).ok).toBe(true)
    expect(refs.sent).toHaveLength(0)
  })

  it('does not act on a malformed email but still returns neutral', async () => {
    refs.orders = [{ token: 'a' }]
    const res = await POST(post({ email: 'not-an-email' }))
    await flush()
    expect((await res.json()).ok).toBe(true)
    expect(refs.sent).toHaveLength(0)
  })

  it('propagates a hard IP rate-limit response', async () => {
    const { NextResponse } = await import('next/server')
    refs.ipLimited = NextResponse.json({ error: 'rate limited' }, { status: 429 })
    expect((await POST(post({ email: 'x@example.com' }))).status).toBe(429)
  })
})
