import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  cfg: true,
  pending: 'demo.myshopify.com' as string | null,
  user: { id: 'u1', email: 'a@b.co', email_confirmed_at: 'x' } as { id: string; email: string; email_confirmed_at: string } | null,
  access: {} as unknown,
  install: { shop_domain: 'demo.myshopify.com' } as unknown,
}
const updateSpy = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'tok' }), delete: () => {} })) }))
vi.mock('../../../../lib/server/shopify', () => ({ shopifyConfigured: () => state.cfg, readPendingShop: () => state.pending }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update: updateSpy }) }), hasSupabaseAdminEnv: () => true }))
vi.mock('../../../../lib/server/page-access', () => ({ resolvePageAccess: async () => state.access }))
vi.mock('../../../../lib/server/shopify-install', () => ({ getInstallByShop: async () => state.install }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: async () => null }))

import { POST } from './route'

const post = (body: unknown = { pageId: 'p1' }) =>
  POST(new Request('https://app.nexez.ai/api/shopify/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('POST /api/shopify/link', () => {
  beforeEach(() => {
    state.cfg = true
    state.pending = 'demo.myshopify.com'
    state.user = { id: 'u1', email: 'a@b.co', email_confirmed_at: 'x' }
    state.access = {}
    state.install = { shop_domain: 'demo.myshopify.com' }
    updateSpy.mockClear()
  })

  it('404 when Shopify is not configured', async () => {
    state.cfg = false
    expect((await post()).status).toBe(404)
  })
  it('401 when not signed in', async () => {
    state.user = null
    expect((await post()).status).toBe(401)
  })
  it('400 without a valid pending-shop cookie', async () => {
    state.pending = null
    expect((await post()).status).toBe(400)
  })
  it('400 without a pageId', async () => {
    expect((await post({})).status).toBe(400)
  })
  it('403 when the caller lacks edit access to the listing', async () => {
    state.access = null
    expect((await post()).status).toBe(403)
    expect(updateSpy).not.toHaveBeenCalled()
  })
  it('links owner_id + page_id on success', async () => {
    const res = await post({ pageId: 'p1' })
    expect(res.status).toBe(200)
    expect(updateSpy).toHaveBeenCalledWith({ owner_id: 'u1', page_id: 'p1' })
  })
})
