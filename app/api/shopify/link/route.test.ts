import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  cfg: true,
  pending: 'demo.myshopify.com' as string | null,
  user: { id: 'u1', email: 'a@b.co', email_confirmed_at: 'x' } as { id: string; email: string; email_confirmed_at: string } | null,
  access: { ownerId: 'owner-1' } as unknown,
  install: { shop_domain: 'demo.myshopify.com', page_id: null } as any,
  conflictingInstall: null as { shop_domain: string } | null,
  credentials: { shop: 'demo.myshopify.com', accessToken: 'access-token' } as { shop: string; accessToken: string } | null,
  syncResult: { ok: true, provider: 'shopify', imported: 4, windows: 0, availabilitySynced: false, note: 'Imported 4' } as any,
}
const updateSpy = vi.fn(() => ({
  eq: vi.fn(() => ({ is: vi.fn(async () => ({ error: null })) })),
}))
const adminQuery = () => {
  const query: any = {}
  query.select = () => query
  query.eq = () => query
  query.is = () => query
  query.neq = () => query
  query.limit = () => query
  query.maybeSingle = async () => ({ data: state.conflictingInstall, error: null })
  query.update = updateSpy
  return query
}

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'tok' }), delete: () => {} })) }))
vi.mock('../../../../lib/server/shopify', () => ({ shopifyConfigured: () => state.cfg, readPendingShop: () => state.pending }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: () => ({ from: () => adminQuery() }), hasSupabaseAdminEnv: () => true }))
vi.mock('../../../../lib/server/page-access', () => ({ resolvePageAccess: async () => state.access }))
vi.mock('../../../../lib/server/shopify-install', () => ({
  getInstallByShop: async () => state.install,
  getShopifyInstallCredentialsByShop: vi.fn(async () => state.credentials),
  markShopifySynced: vi.fn(async () => undefined),
  removeShopifyCatalogFromPage: vi.fn(async () => undefined),
}))
vi.mock('../../../../lib/server/integration-sync', () => ({
  syncPageIntegration: vi.fn(async () => state.syncResult),
}))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: async () => null }))

import { POST } from './route'
import { markShopifySynced, removeShopifyCatalogFromPage } from '../../../../lib/server/shopify-install'
import { syncPageIntegration } from '../../../../lib/server/integration-sync'

const post = (body: unknown = { pageId: 'p1' }) =>
  POST(new Request('https://app.nexez.ai/api/shopify/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('POST /api/shopify/link', () => {
  beforeEach(() => {
    state.cfg = true
    state.pending = 'demo.myshopify.com'
    state.user = { id: 'u1', email: 'a@b.co', email_confirmed_at: 'x' }
    state.access = { ownerId: 'owner-1' }
    state.install = { shop_domain: 'demo.myshopify.com', page_id: null }
    state.conflictingInstall = null
    state.credentials = { shop: 'demo.myshopify.com', accessToken: 'access-token' }
    state.syncResult = { ok: true, provider: 'shopify', imported: 4, windows: 0, availabilitySynced: false, note: 'Imported 4' }
    vi.clearAllMocks()
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
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      owner_id: 'owner-1',
      page_id: 'p1',
      linked_at: expect.any(String),
      last_synced_at: null,
      updated_at: expect.any(String),
    }))
    expect(syncPageIntegration).toHaveBeenCalledWith(expect.anything(), 'shopify', 'p1', {
      shopifyCredentials: state.credentials,
    })
    expect(markShopifySynced).toHaveBeenCalledWith(expect.anything(), 'p1', expect.any(String), {
      shop: 'demo.myshopify.com',
      clearCatalogSyncState: true,
    })
    expect(await res.json()).toMatchObject({
      ok: true,
      sync: { status: 'synced', imported: 4 },
    })
  })

  it('rejects linking two active stores to the same listing', async () => {
    state.conflictingInstall = { shop_domain: 'other.myshopify.com' }
    const res = await post({ pageId: 'p1' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already connected/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('removes this shop catalog from its previous listing before moving it', async () => {
    state.install = { shop_domain: 'demo.myshopify.com', page_id: 'old-page' }
    const res = await post({ pageId: 'p1' })
    expect(res.status).toBe(200)
    expect(removeShopifyCatalogFromPage).toHaveBeenCalledWith(expect.anything(), 'old-page', 'demo.myshopify.com')
  })

  it('keeps the successful link when the first catalog sync needs attention', async () => {
    state.syncResult = { ok: false, status: 502, error: 'Shopify catalog is temporarily unavailable.' }
    const res = await post({ pageId: 'p1' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      sync: { status: 'attention', error: 'Shopify catalog is temporarily unavailable.' },
    })
  })
})
