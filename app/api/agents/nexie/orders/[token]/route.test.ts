import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, loadRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  loadRef: { view: null as any },
}))

vi.mock('../../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../../../lib/agents/nexie-auth', () => ({ authenticateNexieRequest: vi.fn(async () => authRef.result) }))
vi.mock('../../../../../../lib/server/load-order', () => ({ loadOrderByToken: vi.fn(async () => loadRef.view) }))
// NB: lib/buyer-portal is NOT mocked — the pure status/timeline/label helpers run for real.

import { GET } from './route'

const req = () => new Request('https://nexez.test/api/agents/nexie/orders/tok_123') as any
const ctx = (token = 'tok_123') => ({ params: Promise.resolve({ token }) })

const baseView = {
  kind: 'checkout' as const,
  token: 'tok_123',
  reference: 'cs_test_1',
  offerName: 'Strategy call',
  amountCents: 30000,
  currency: 'usd',
  status: 'paid',
  sellerName: 'Apex Studio',
  sellerEmail: 'seller@apex.test',
  buyerEmail: 'Buyer@X.com',
  slug: 'apex',
  createdAt: '2026-06-30T00:00:00Z',
  requests: [] as any[],
  review: null,
  canReview: true,
}

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'u1', email: 'buyer@x.com', email_confirmed_at: '2026-01-01T00:00:00Z' } }
  loadRef.view = { ...baseView }
})

describe('order detail endpoint', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req(), ctx())).status).toBe(401)
  })

  it('404s when the account email is unconfirmed', async () => {
    authRef.result = { ok: true, user: { id: 'u1', email: 'buyer@x.com', email_confirmed_at: null } }
    expect((await GET(req(), ctx())).status).toBe(404)
  })

  it('404s when the token is empty', async () => {
    expect((await GET(req(), ctx('   '))).status).toBe(404)
  })

  it('404s when the order is not found', async () => {
    loadRef.view = null
    expect((await GET(req(), ctx())).status).toBe(404)
  })

  it('404s when the order belongs to a different buyer (cross-account guard)', async () => {
    loadRef.view = { ...baseView, buyerEmail: 'someone-else@x.com' }
    const res = await GET(req(), ctx())
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Order not found.')
  })

  it('404s when the order has no buyer email to bind on', async () => {
    loadRef.view = { ...baseView, buyerEmail: null }
    expect((await GET(req(), ctx())).status).toBe(404)
  })

  it('returns the receipt with computed status + timeline on an email match (case-insensitive)', async () => {
    const res = await GET(req(), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.order.offerName).toBe('Strategy call')
    expect(body.order.amountCents).toBe(30000)
    expect(body.order.statusLabel).toBe('Paid') // from describeOrderStatus
    expect(body.order.statusTone).toBe('positive')
    expect(Array.isArray(body.order.timeline)).toBe(true)
    expect(body.order.timeline.length).toBeGreaterThan(0)
    expect(body.order.canRequestRefund).toBe(true) // 'paid' is refundable
  })

  it('labels refund/problem requests via the shared portal maps', async () => {
    loadRef.view = {
      ...baseView,
      status: 'partial_refund',
      requests: [
        { id: 'r1', kind: 'refund_request', status: 'acknowledged', message: 'Please refund', createdAt: '2026-06-30T01:00:00Z' },
      ],
    }
    const body = await (await GET(req(), ctx())).json()
    expect(body.order.statusLabel).toBe('Partially refunded')
    expect(body.order.requests[0].kindLabel).toBe('Refund request')
    expect(body.order.requests[0].statusLabel).toBe('Seller is reviewing')
  })
})
