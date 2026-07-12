import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../../test/supabase-mock'

const { hasSupabaseAdminEnv, createAdminClient } = vi.hoisted(() => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(),
}))
vi.mock('../../../../../utils/supabase/admin', () => ({ createAdminClient, hasSupabaseAdminEnv }))
vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/supabase', async () => {
  const { createSupabaseMock: mk } = await import('../../../../../test/supabase-mock')
  return { supabase: mk((ctx: QueryContext) => (ctx.table === 'pages_public' ? { data: { name: 'Acme Studio' } } : { data: null })) }
})

import { PUT, GET } from './route'
import { POST as CANCEL } from './cancel/route'

const PAGE = { id: 'pg1', owner_id: 'owner-1', slug: 'acme', name: 'Acme Studio', currency: 'usd', services: [{ name: 'Strategy Session', price: '$1,200', description: '', url: '' }], products: [] }
const ROW = {
  id: 'sess_1', channel: 'ucp', slug: 'acme', status: 'ready', currency: 'usd',
  line_items: [{ id: 'services-0', offerKey: 'services-0', kind: 'services', index: 0, name: 'Strategy Session', description: '', quantity: 1, unitAmount: 120000, subtotal: 120000, currency: 'usd', offerType: 'fixed', availability: 'available' }],
  totals: { currency: 'usd', subtotal: 120000, tax: 0, total: 120000 }, buyer: null, expires_at: '2999-01-01T00:00:00.000Z',
}
function adminMock(handler: (ctx: QueryContext) => { data?: any; error?: any } | undefined) {
  return createSupabaseMock((ctx) => handler(ctx) ?? { data: null, error: null }) as any
}
function req(body: unknown) {
  return new Request('https://nexez.app/api/ucp/checkout-sessions/sess_1', {
    method: 'PUT',
    headers: { authorization: 'Bearer sk_ucp', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'sess_1' }) }

describe('UCP checkout-sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasSupabaseAdminEnv.mockReturnValue(true)
    vi.stubEnv('UCP_SHARED_SECRET', 'sk_ucp')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('PUT re-prices against the live page (200)', async () => {
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'checkout_sessions' && c.op === 'select') return { data: ROW }
        if (c.table === 'pages') return { data: PAGE }
        if (c.table === 'checkout_sessions' && c.op === 'update') return { error: null }
        return { data: null }
      }),
    )
    const res = await PUT(req({ line_items: [{ item: { id: 'acme:services-0' }, quantity: 2 }] }), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).totals.find((t: any) => t.type === 'total').amount).toBe(240000)
  })

  it('PUT 409 on a terminal session', async () => {
    createAdminClient.mockReturnValue(adminMock((c) => (c.table === 'checkout_sessions' ? { data: { ...ROW, status: 'completed' } } : { data: null })))
    expect((await PUT(req({ line_items: [{ item: { id: 'acme:services-0' } }] }), ctx)).status).toBe(409)
  })

  it('PUT 404 for a non-ucp / missing session', async () => {
    createAdminClient.mockReturnValue(adminMock(() => ({ data: null })))
    expect((await PUT(req({ line_items: [{ item: { id: 'acme:services-0' } }] }), ctx)).status).toBe(404)
  })

  it('GET returns the snapshot (200)', async () => {
    createAdminClient.mockReturnValue(adminMock((c) => (c.table === 'checkout_sessions' ? { data: ROW } : { data: null })))
    const getReq = new Request('https://nexez.app/api/ucp/checkout-sessions/sess_1', { headers: { authorization: 'Bearer sk_ucp' } })
    const res = await GET(getReq, ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('sess_1')
  })

  it('cancel a live session → 200 canceled; completed → 409', async () => {
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'checkout_sessions' && c.op === 'select') return { data: ROW }
        if (c.table === 'checkout_sessions' && c.op === 'update') return { error: null }
        return { data: null }
      }),
    )
    const cancelReq = new Request('https://nexez.app/api/ucp/checkout-sessions/sess_1/cancel', { method: 'POST', headers: { authorization: 'Bearer sk_ucp' } })
    const res = await CANCEL(cancelReq, ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('canceled')

    createAdminClient.mockReturnValue(adminMock((c) => (c.table === 'checkout_sessions' ? { data: { ...ROW, status: 'completed' } } : { data: null })))
    expect((await CANCEL(cancelReq, ctx)).status).toBe(409)
  })
})
