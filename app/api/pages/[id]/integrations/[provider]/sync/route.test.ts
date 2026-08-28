import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'o@x.com', email_confirmed_at: 't' } as any,
  access: { pageId: 'pg1', ownerId: 'owner-1', role: 'owner' } as any,
  adminConfigured: true,
  gate: { ok: true, ownerId: 'owner-1' } as any,
  install: {
    shop_domain: 'demo.myshopify.com',
    owner_id: 'owner-1',
    page_id: 'pg1',
    scope: 'read_products',
    uninstalled_at: null,
    mapping_generation: 5,
    mapping_transition_token: null,
  } as any,
  installReadError: false,
  installedCredentials: {
    shop: 'demo.myshopify.com',
    accessToken: 'oauth-token',
  } as { shop: string; accessToken: string } | null,
  result: {
    ok: true,
    provider: 'shopify',
    imported: 3,
    windows: 0,
    availabilitySynced: false,
    note: 'Imported 3',
  } as any,
  syncArgs: null as any,
}))

const spies = vi.hoisted(() => ({
  createAdminClient: vi.fn(() => ({})),
  gateIntegrationImport: vi.fn(async () => h.gate),
  resolvePageAccess: vi.fn(async () => h.access),
  getInstallByPage: vi.fn(async () => {
    if (h.installReadError) throw new Error('storage failed')
    return h.install
  }),
  getShopifyInstallCredentialsByShop: vi.fn(async () => h.installedCredentials),
}))

vi.mock('next/headers', () => ({ cookies: async () => ({}) }))
vi.mock('../../../../../../../lib/rate-limit', () => ({ enforceRateLimit: async () => null }))
vi.mock('../../../../../../../utils/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('../../../../../../../utils/supabase/admin', () => ({
  createAdminClient: spies.createAdminClient,
  hasSupabaseAdminEnv: () => h.adminConfigured,
}))
vi.mock('../../../../../../../lib/server/integration-importers', () => ({
  gateIntegrationImport: spies.gateIntegrationImport,
}))
vi.mock('../../../../../../../lib/server/page-access', () => ({
  resolvePageAccess: spies.resolvePageAccess,
}))
vi.mock('../../../../../../../lib/server/shopify-install', () => ({
  activeShopifyInstallMapping: (install: any) => install?.mapping_generation && !install.mapping_transition_token && install.owner_id && install.page_id
    ? { shop: install.shop_domain, ownerId: install.owner_id, pageId: install.page_id, generation: install.mapping_generation }
    : null,
  getInstallByPage: spies.getInstallByPage,
  getShopifyInstallCredentialsByShop: spies.getShopifyInstallCredentialsByShop,
}))
vi.mock('../../../../../../../lib/server/integration-sync', () => ({
  isSyncProvider: (provider: string) => provider === 'calendly' || provider === 'shopify',
  syncPageIntegration: async (_admin: any, provider: string, pageId: string, options?: unknown) => {
    h.syncArgs = { provider, pageId, options }
    return h.result
  },
}))

import { POST } from './route'

const request = () => new Request('https://nexez.test/api/pages/pg1/integrations/shopify/sync', { method: 'POST' })
const context = (provider: string) => ({ params: Promise.resolve({ id: 'pg1', provider }) })

describe('POST /api/pages/[id]/integrations/[provider]/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.user = { id: 'u1', email: 'o@x.com', email_confirmed_at: 't' }
    h.access = { pageId: 'pg1', ownerId: 'owner-1', role: 'owner' }
    h.adminConfigured = true
    h.gate = { ok: true, ownerId: 'owner-1' }
    h.install = {
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'pg1',
      scope: 'read_products',
      uninstalled_at: null,
      mapping_generation: 5,
      mapping_transition_token: null,
    }
    h.installReadError = false
    h.installedCredentials = { shop: 'demo.myshopify.com', accessToken: 'oauth-token' }
    h.result = {
      ok: true,
      provider: 'shopify',
      imported: 3,
      windows: 0,
      availabilitySynced: false,
      note: 'Imported 3',
    }
    h.syncArgs = null
  })

  it('returns 400 for an unsupported provider before auth or sync', async () => {
    const response = await POST(request(), context('stripe'))
    expect(response.status).toBe(400)
    expect(h.syncArgs).toBeNull()
  })

  it('returns 401 when not authenticated', async () => {
    h.user = null
    expect((await POST(request(), context('shopify'))).status).toBe(401)
  })

  it('keeps non-Shopify providers behind the premium integration gate', async () => {
    h.gate = { ok: false, status: 402, error: 'Upgrade to Pro' }

    const response = await POST(request(), context('calendly'))

    expect(response.status).toBe(402)
    expect(spies.gateIntegrationImport).toHaveBeenCalled()
    expect(spies.getInstallByPage).not.toHaveBeenCalled()
    expect(h.syncArgs).toBeNull()
  })

  it('syncs an owner-verified installed Shopify app without the Pro gate', async () => {
    h.gate = { ok: false, status: 402, error: 'Upgrade to Pro' }

    const response = await POST(request(), context('shopify'))

    expect(response.status).toBe(200)
    expect(spies.resolvePageAccess).toHaveBeenCalledWith({
      pageId: 'pg1',
      userId: 'u1',
      userEmail: 'o@x.com',
      userEmailConfirmedAt: 't',
      requireEditor: true,
    })
    expect(spies.gateIntegrationImport).not.toHaveBeenCalled()
    expect(h.syncArgs).toEqual({
      provider: 'shopify',
      pageId: 'pg1',
      options: {
        shopifyCredentials: h.installedCredentials,
        shopifyMapping: {
          shop: 'demo.myshopify.com',
          ownerId: 'owner-1',
          pageId: 'pg1',
          generation: 5,
        },
        clearShopifyCatalogSyncState: true,
      },
    })
  })

  it('keeps manually stored Shopify credentials Pro-gated when no install exists', async () => {
    h.install = null
    h.gate = { ok: false, status: 402, error: 'Upgrade to Pro' }

    const response = await POST(request(), context('shopify'))

    expect(response.status).toBe(402)
    expect(spies.gateIntegrationImport).toHaveBeenCalled()
    expect(spies.getShopifyInstallCredentialsByShop).not.toHaveBeenCalled()
    expect(h.syncArgs).toBeNull()
  })

  it('never falls back to manual credentials when an OAuth install needs reconnecting', async () => {
    h.installedCredentials = null
    h.gate = { ok: true, ownerId: 'owner-1' }

    const response = await POST(request(), context('shopify'))

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/reconnect the shopify app/i)
    expect(spies.gateIntegrationImport).not.toHaveBeenCalled()
    expect(h.syncArgs).toBeNull()
  })

  it('fails closed when the install owner and page owner do not match', async () => {
    h.install = { ...h.install, owner_id: 'different-owner' }

    const response = await POST(request(), context('shopify'))

    expect(response.status).toBe(409)
    expect(spies.getShopifyInstallCredentialsByShop).not.toHaveBeenCalled()
    expect(spies.gateIntegrationImport).not.toHaveBeenCalled()
  })

  it('does not classify a failed install lookup as a manual Pro connection', async () => {
    h.installReadError = true

    const response = await POST(request(), context('shopify'))

    expect(response.status).toBe(503)
    expect(spies.gateIntegrationImport).not.toHaveBeenCalled()
    expect(h.syncArgs).toBeNull()
  })

  it('never falls back to a Pro manual token while an installed mapping is moving', async () => {
    h.install = { ...h.install, mapping_generation: 6, mapping_transition_token: 'lease-1' }
    h.gate = { ok: true, ownerId: 'owner-1' }

    const response = await POST(request(), context('shopify'))

    expect(response.status).toBe(409)
    expect(spies.gateIntegrationImport).not.toHaveBeenCalled()
    expect(spies.getShopifyInstallCredentialsByShop).not.toHaveBeenCalled()
    expect(h.syncArgs).toBeNull()
  })

  it('requires service-role authorization for the installed-app exception', async () => {
    h.adminConfigured = false
    expect((await POST(request(), context('shopify'))).status).toBe(503)
    expect(spies.resolvePageAccess).not.toHaveBeenCalled()
  })

  it('maps an installed-app sync failure to its status', async () => {
    h.result = { ok: false, status: 409, error: 'This listing changed during the sync.' }

    const response = await POST(request(), context('shopify'))

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/listing changed/i)
  })
})
