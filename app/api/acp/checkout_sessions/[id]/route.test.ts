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

import { POST as UPDATE, GET } from './route'
import { POST as CANCEL } from './cancel/route'

const PAGE = {
  id: 'pg1',
  owner_id: 'owner-1',
  slug: 'acme',
  name: 'Acme Studio',
  currency: 'usd',
  services: [{ name: 'Strategy Session', price: '$1,200', description: '', url: '' }],
  products: [],
}

const ROW = {
  id: 'sess_1',
  channel: 'acp',
  slug: 'acme',
  status: 'ready',
  currency: 'usd',
  line_items: [{ id: 'services-0', offerKey: 'services-0', kind: 'services', index: 0, name: 'Strategy Session', description: '', quantity: 1, unitAmount: 120000, subtotal: 120000, currency: 'usd', offerType: 'fixed', availability: 'available' }],
  totals: { currency: 'usd', subtotal: 120000, tax: 0, total: 120000 },
  buyer: null,
  expires_at: '2999-01-01T00:00:00.000Z',
}

function adminMock(handler: (ctx: QueryContext) => { data?: any; error?: any } | undefined) {
  return createSupabaseMock((ctx) => handler(ctx) ?? { data: null, error: null }) as any
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://nexez.app/api/acp/checkout_sessions/sess_1', {
    method: 'POST',
    headers: { authorization: 'Bearer sk_acp', 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'sess_1' }) }

describe('ACP checkout_sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasSupabaseAdminEnv.mockReturnValue(true)
    vi.stubEnv('ACP_SHARED_SECRET', 'sk_acp')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('update re-prices against the live page (200, new quantity)', async () => {
    let updated: any
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'checkout_sessions' && c.op === 'select') return { data: ROW }
        if (c.table === 'pages') return { data: PAGE }
        if (c.table === 'checkout_sessions' && c.op === 'update') {
          updated = c.payload
          return { error: null }
        }
        return { data: null }
      }),
    )
    const res = await UPDATE(req({ line_items: [{ id: 'acme:services-0', quantity: 3 }] }), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totals.find((t: any) => t.type === 'total').amount).toBe(360000)
    expect(updated.status).toBe('ready')
  })

  it('update 409 on a terminal (completed) session', async () => {
    createAdminClient.mockReturnValue(adminMock((c) => (c.table === 'checkout_sessions' ? { data: { ...ROW, status: 'completed' } } : { data: null })))
    const res = await UPDATE(req({ line_items: [{ id: 'acme:services-0' }] }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('session_terminal')
  })

  it('update 409 + marks expired on a lapsed session', async () => {
    let markedExpired = false
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'checkout_sessions' && c.op === 'select') return { data: { ...ROW, expires_at: '2000-01-01T00:00:00.000Z' } }
        if (c.table === 'checkout_sessions' && c.op === 'update') {
          if (c.payload?.status === 'expired') markedExpired = true
          return { error: null }
        }
        return { data: null }
      }),
    )
    const res = await UPDATE(req({ line_items: [{ id: 'acme:services-0' }] }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('session_expired')
    expect(markedExpired).toBe(true)
  })

  it('update 404 for a non-acp / missing session', async () => {
    createAdminClient.mockReturnValue(adminMock(() => ({ data: null })))
    expect((await UPDATE(req({ line_items: [{ id: 'acme:services-0' }] }), ctx)).status).toBe(404)
  })

  it('update 401 without the shared secret', async () => {
    vi.stubEnv('ACP_SHARED_SECRET', '')
    expect((await UPDATE(req({ line_items: [{ id: 'acme:services-0' }] }), ctx)).status).toBe(401)
  })

  it('get returns the persisted snapshot (200)', async () => {
    createAdminClient.mockReturnValue(adminMock((c) => (c.table === 'checkout_sessions' ? { data: ROW } : { data: null })))
    const getReq = new Request('https://nexez.app/api/acp/checkout_sessions/sess_1', { headers: { authorization: 'Bearer sk_acp' } })
    const res = await GET(getReq, ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('sess_1')
  })

  it('cancel a live session → 200 canceled', async () => {
    let updated: any
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'checkout_sessions' && c.op === 'select') return { data: ROW }
        if (c.table === 'checkout_sessions' && c.op === 'update') {
          updated = c.payload
          return { error: null }
        }
        return { data: null }
      }),
    )
    const res = await CANCEL(req(undefined), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('canceled')
    expect(updated.status).toBe('canceled')
  })

  it('cancel refuses a completed session (409)', async () => {
    createAdminClient.mockReturnValue(adminMock((c) => (c.table === 'checkout_sessions' ? { data: { ...ROW, status: 'completed' } } : { data: null })))
    const res = await CANCEL(req(undefined), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('session_terminal')
  })
})
