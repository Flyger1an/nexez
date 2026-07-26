import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const { hasSupabaseAdminEnv, createAdminClient } = vi.hoisted(() => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(),
}))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient, hasSupabaseAdminEnv }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../lib/supabase', async () => {
  const { createSupabaseMock: mk } = await import('../../../../test/supabase-mock')
  return { supabase: mk((ctx: QueryContext) => (ctx.table === 'pages_public' ? { data: { name: 'Acme Studio' } } : { data: null })) }
})

import { POST } from './route'

const PAGE = { id: 'pg1', owner_id: 'owner-1', slug: 'acme', name: 'Acme Studio', currency: 'usd', services: [{ name: 'Strategy Session', price: '$1,200', description: '', url: '' }], products: [] }
const LIVE_SELLER = { plan_id: 'pro', status: 'active', trial_ends_at: null, account_origin: 'legacy', stripe_connect_account_id: 'acct', stripe_connect_charges_enabled: true }

function adminMock(handler: (ctx: QueryContext) => { data?: any; error?: any } | undefined) {
  return createSupabaseMock((ctx) => handler(ctx) ?? { data: null, error: null }) as any
}
function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://nexez.app/api/ucp/checkout-sessions', {
    method: 'POST',
    headers: { authorization: 'Bearer sk_ucp', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ucp/checkout-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasSupabaseAdminEnv.mockReturnValue(true)
    vi.stubEnv('UCP_SHARED_SECRET', 'sk_ucp')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('creates a UCP session (201) with nested item.id + totals', async () => {
    let inserted: any
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'platform_admins') return { data: null }
        if (c.table === 'billing_subscriptions') return { data: LIVE_SELLER }
        if (c.table === 'pages') return { data: PAGE }
        if (c.table === 'checkout_sessions' && c.op === 'insert') {
          inserted = c.payload
          return { data: { ...c.payload } }
        }
        return { data: null }
      }),
    )
    const res = await POST(req({ line_items: [{ item: { id: 'acme:services-0' }, quantity: 1 }] }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('incomplete')
    expect(body.line_items[0].item.id).toBe('acme:services-0')
    expect(body.totals.find((t: any) => t.type === 'total').amount).toBe(120000)
    expect(body.links.terms).toBeTruthy()
    expect(inserted.channel).toBe('ucp')
  })

  it('401 dormant without UCP_SHARED_SECRET', async () => {
    vi.stubEnv('UCP_SHARED_SECRET', '')
    expect((await POST(req({ line_items: [{ item: { id: 'acme:services-0' } }] }))).status).toBe(401)
  })

  it('400 mixed_merchant on a cross-tenant cart', async () => {
    const res = await POST(req({ line_items: [{ item: { id: 'acme:services-0' } }, { item: { id: 'beta:products-0' } }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('mixed_merchant')
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('keeps an expired-trial seller orderable on the Free fallback', async () => {
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'pages') return { data: PAGE }
        if (c.table === 'platform_admins') return { data: null }
        if (c.table === 'billing_subscriptions') return { data: { plan_id: 'pro', status: 'paused', trial_ends_at: null, account_origin: 'trial' } }
        if (c.table === 'checkout_sessions' && c.op === 'insert') return { data: { ...c.payload } }
        return { data: null }
      }),
    )
    expect((await POST(req({ line_items: [{ item: { id: 'acme:services-0' } }] }))).status).toBe(201)
  })
})
