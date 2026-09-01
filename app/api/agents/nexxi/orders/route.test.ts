import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, ordersRef, rateLimitRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  ordersRef: { handler: vi.fn(async (_email: string) => [] as any[]) },
  rateLimitRef: { response: null as any },
}))

vi.mock('../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../lib/agents/nexxi-auth', () => ({
  authenticateNexxiRequest: vi.fn(async () => authRef.result),
}))
vi.mock('../../../../../lib/server/load-order', () => ({
  findOrdersByEmail: (email: string) => ordersRef.handler(email),
}))

import { GET } from './route'

const req = () => new Request('https://nexez.test/api/agents/nexxi/orders') as any

beforeEach(() => {
  rateLimitRef.response = null
  ordersRef.handler = vi.fn(async () => [])
})

describe('GET /api/agents/nexxi/orders', () => {
  it('passes through the rate-limit response when throttled', async () => {
    rateLimitRef.response = NextResponse.json({ error: 'rate' }, { status: 429 })
    const res = await GET(req())
    expect(res.status).toBe(429)
  })

  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ error: 'x', code: 'auth_required' }, { status: 401 }) }
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns no orders and skips the lookup when the email is unconfirmed', async () => {
    authRef.result = { ok: true, user: { id: 'u1', email: 'a@b.com', email_confirmed_at: null }, db: {} }
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, orders: [] })
    expect(ordersRef.handler).not.toHaveBeenCalled()
  })

  it('returns the buyer orders for a confirmed email', async () => {
    const orders = [
      { kind: 'checkout', token: 't1', offerName: 'Deep Clean', amountCents: 15000, currency: 'usd', status: 'paid', sellerName: 'Demo Co', slug: 'demo', createdAt: '2026-06-18' },
    ]
    ordersRef.handler = vi.fn(async () => orders)
    authRef.result = { ok: true, user: { id: 'u1', email: 'buyer@x.com', email_confirmed_at: '2026-06-18T00:00:00Z' }, db: {} }
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, orders })
    expect(ordersRef.handler).toHaveBeenCalledWith('buyer@x.com')
  })
})
