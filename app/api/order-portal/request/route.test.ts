import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolveRef, adminRef } = vi.hoisted(() => ({
  resolveRef: { fn: (_t: string) => null as any },
  adminRef: { insert: (_p: any) => ({ error: null }) as { error: any } },
}))

// Rate limiting has its own dedicated test; keep it a pass-through here.
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../lib/server/load-order', () => ({ resolveOrderForRequest: (t: string) => resolveRef.fn(t) }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    from: () => ({ insert: (p: any) => Promise.resolve(adminRef.insert(p)) }),
  })),
}))
// Email is a no-op (RESEND unset) — keep builders importable but inert.
vi.mock('../../../../lib/email', () => ({
  hasEmailEnv: vi.fn(() => false),
  sendEmail: vi.fn(async () => ({ ok: true })),
  buildBuyerRequestEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
  buildBuyerStatusEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
}))
vi.mock('../../../../lib/agent-page', () => ({ getBaseUrl: () => 'https://nexez.app' }))

import { POST } from './route'

const target = (over: Record<string, unknown> = {}) => ({
  kind: 'checkout',
  orderId: 'o1',
  ownerId: 'owner-1',
  pageId: 'p1',
  slug: 'acme',
  offerName: 'Logo',
  amountCents: 5000,
  currency: 'usd',
  status: 'paid',
  buyerEmail: 'buyer@example.com',
  sellerName: 'Acme',
  sellerEmail: 'acme@example.com',
  openRequestKinds: [] as string[],
  requestTotals: {} as Record<string, number>,
  ...over,
})

const post = (body: unknown) =>
  new Request('https://nexez.app/api/order-portal/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/order-portal/request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveRef.fn = () => target()
    adminRef.insert = () => ({ error: null })
  })

  it('400 on a missing token', async () => {
    expect((await POST(post({ kind: 'refund_request' }))).status).toBe(400)
  })

  it('400 on an unknown request kind', async () => {
    expect((await POST(post({ token: 't', kind: 'nope' }))).status).toBe(400)
  })

  it('400 when a problem report has no message', async () => {
    expect((await POST(post({ token: 't', kind: 'problem_report', message: '' }))).status).toBe(400)
  })

  it('404 when the token resolves to nothing', async () => {
    resolveRef.fn = () => null
    expect((await POST(post({ token: 'bad', kind: 'refund_request' }))).status).toBe(404)
  })

  it('409 when the order is not refundable', async () => {
    resolveRef.fn = () => target({ status: 'refunded' })
    const res = await POST(post({ token: 't', kind: 'refund_request' }))
    expect(res.status).toBe(409)
  })

  it('409 when a duplicate open request exists', async () => {
    resolveRef.fn = () => target({ openRequestKinds: ['refund_request'] })
    const res = await POST(post({ token: 't', kind: 'refund_request' }))
    expect(res.status).toBe(409)
  })

  it('429 when the per-order lifetime cap is reached', async () => {
    resolveRef.fn = () => target({ requestTotals: { refund_request: 5 } })
    const res = await POST(post({ token: 't', kind: 'refund_request' }))
    expect(res.status).toBe(429)
  })

  it('maps a unique-violation (23505) race to a 409, not a 500', async () => {
    adminRef.insert = () => ({ error: { code: '23505', message: 'duplicate key' } })
    const res = await POST(post({ token: 't', kind: 'refund_request' }))
    expect(res.status).toBe(409)
  })

  it('inserts the request with the resolved owner + order ids and returns ok', async () => {
    let captured: any = null
    adminRef.insert = (p) => ((captured = p), { error: null })
    const res = await POST(post({ token: 't', kind: 'refund_request', message: 'wrong item' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, kind: 'refund_request' })
    expect(captured).toMatchObject({
      order_kind: 'checkout',
      order_id: 'o1',
      owner_id: 'owner-1',
      kind: 'refund_request',
      message: 'wrong item',
    })
  })

  it('500 when the insert fails', async () => {
    adminRef.insert = () => ({ error: { message: 'boom' } })
    expect((await POST(post({ token: 't', kind: 'refund_request' }))).status).toBe(500)
  })

  it('allows a problem report regardless of refundability', async () => {
    resolveRef.fn = () => target({ status: 'refunded' })
    const res = await POST(post({ token: 't', kind: 'problem_report', message: 'still broken' }))
    expect(res.status).toBe(200)
  })
})
