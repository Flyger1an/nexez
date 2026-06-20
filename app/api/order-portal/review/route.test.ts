import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveRef, adminRef } = vi.hoisted(() => ({
  resolveRef: { fn: (_token: string) => null as any },
  adminRef: {
    payload: null as any,
    response: null as any,
  },
}))

vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../lib/server/load-order', () => ({ resolveOrderForRequest: (token: string) => resolveRef.fn(token) }))
vi.mock('../../../../lib/server/reviews', () => ({ hashBuyerEmail: (email: string | null) => (email ? `hash:${email}` : null) }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    from: () => ({
      insert: (payload: any) => {
        adminRef.payload = payload
        return {
          select: () => ({
            single: async () => adminRef.response,
          }),
        }
      },
    }),
  })),
}))

import { POST } from './route'

const target = (over: Record<string, unknown> = {}) => ({
  kind: 'checkout',
  orderId: 'order-1',
  ownerId: 'owner-1',
  pageId: 'page-1',
  slug: 'acme',
  offerName: 'Strategy Session',
  offerKey: 'services-0',
  amountCents: 50000,
  currency: 'usd',
  status: 'paid',
  buyerEmail: 'buyer@example.com',
  sellerName: 'Acme',
  sellerEmail: 'seller@example.com',
  openRequestKinds: [],
  requestTotals: {},
  ...over,
})

const post = (body: unknown) =>
  new Request('https://nexez.app/api/order-portal/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/order-portal/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveRef.fn = () => target()
    adminRef.payload = null
    adminRef.response = {
      data: {
        id: 'rev-1',
        rating: 5,
        title: 'Great handoff',
        body: 'Everything was clear.',
        tags: ['Fast response'],
        status: 'published',
        created_at: '2026-06-20T00:00:00.000Z',
      },
      error: null,
    }
  })

  it('400 on a missing token', async () => {
    expect((await POST(post({ rating: 5 }))).status).toBe(400)
  })

  it('400 on an invalid rating', async () => {
    expect((await POST(post({ token: 't', rating: 6 }))).status).toBe(400)
  })

  it('400 on a low rating without a note', async () => {
    expect((await POST(post({ token: 't', rating: 2, body: '' }))).status).toBe(400)
  })

  it('404 when the order token does not resolve', async () => {
    resolveRef.fn = () => null
    expect((await POST(post({ token: 'bad', rating: 5 }))).status).toBe(404)
  })

  it('409 when the order has no owner', async () => {
    resolveRef.fn = () => target({ ownerId: null })
    expect((await POST(post({ token: 't', rating: 5 }))).status).toBe(409)
  })

  it('409 when the order is not review eligible', async () => {
    resolveRef.fn = () => target({ status: 'refunded' })
    expect((await POST(post({ token: 't', rating: 5 }))).status).toBe(409)
  })

  it('409 when the order already has a review', async () => {
    adminRef.response = { data: null, error: { code: '23505', message: 'duplicate key' } }
    expect((await POST(post({ token: 't', rating: 5 }))).status).toBe(409)
  })

  it('500 when the insert fails', async () => {
    adminRef.response = { data: null, error: { message: 'boom' } }
    expect((await POST(post({ token: 't', rating: 5 }))).status).toBe(500)
  })

  it('inserts a verified review with order identity and normalized tags', async () => {
    const res = await POST(post({
      token: 't',
      rating: 5,
      title: '  Great handoff  ',
      body: '  Everything was clear.  ',
      tags: ['Fast response', 'Bad tag', 'Fast response', 'Agent-friendly'],
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      review: {
        id: 'rev-1',
        rating: 5,
        tags: ['Fast response'],
      },
    })
    expect(adminRef.payload).toMatchObject({
      order_kind: 'checkout',
      order_id: 'order-1',
      owner_id: 'owner-1',
      page_id: 'page-1',
      slug: 'acme',
      offer_name: 'Strategy Session',
      offer_key: 'services-0',
      rating: 5,
      title: 'Great handoff',
      body: 'Everything was clear.',
      tags: ['Fast response', 'Agent-friendly'],
      status: 'published',
      buyer_email_hash: 'hash:buyer@example.com',
      metadata: { source: 'order_portal' },
    })
  })
})
