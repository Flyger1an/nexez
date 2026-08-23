import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/shopify', () => ({
  shopifyConfigured: vi.fn(() => true),
  verifyShopifySessionToken: vi.fn(),
}))
vi.mock('../../../../../lib/server/shopify-install', () => ({
  activeShopifyInstallMapping: vi.fn((install: any) => install?.mapping_generation && !install.mapping_transition_token
    ? { shop: install.shop_domain, ownerId: install.owner_id, pageId: install.page_id, generation: install.mapping_generation }
    : null),
  getInstallByShop: vi.fn(),
  getShopifyInstallCredentialsByShop: vi.fn(),
}))
vi.mock('../../../../../lib/server/integration-sync', () => ({
  syncPageIntegration: vi.fn(),
}))
vi.mock('../../../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
  hasSupabaseAdminEnv: vi.fn(() => true),
}))
const { planRef } = vi.hoisted(() => ({ planRef: { allowed: true } }))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => planRef.allowed) }))

import { POST } from './route'
import { verifyShopifySessionToken } from '../../../../../lib/server/shopify'
import {
  getInstallByShop,
  getShopifyInstallCredentialsByShop,
} from '../../../../../lib/server/shopify-install'
import { syncPageIntegration } from '../../../../../lib/server/integration-sync'
import { ownerAllows } from '../../../../../lib/server/plan'

const request = () => new Request('https://app.nexez.ai/api/shopify/session/sync', {
  method: 'POST',
  headers: { authorization: 'Bearer session-token' },
})

describe('POST /api/shopify/session/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifyShopifySessionToken).mockReturnValue({
      shop: 'demo.myshopify.com',
      userId: '42',
      sessionId: 'session-1',
      expiresAt: 9999999999,
    })
    vi.mocked(getInstallByShop).mockResolvedValue({
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      scope: 'read_products,write_app_proxy',
      uninstalled_at: null,
      mapping_generation: 4,
      mapping_transition_token: null,
    })
    vi.mocked(getShopifyInstallCredentialsByShop).mockResolvedValue({
      shop: 'demo.myshopify.com',
      accessToken: 'access-token',
    })
    vi.mocked(syncPageIntegration).mockResolvedValue({
      ok: true,
      provider: 'shopify',
      imported: 12,
      windows: 0,
      availabilitySynced: false,
      note: null,
    })
    planRef.allowed = true
  })

  it('requires a valid Shopify session token', async () => {
    vi.mocked(verifyShopifySessionToken).mockReturnValue(null)
    expect((await POST(request())).status).toBe(401)
  })

  it('syncs only the shop proven by the App Bridge token', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, imported: 12 })
    expect(getShopifyInstallCredentialsByShop).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com')
    expect(syncPageIntegration).toHaveBeenCalledWith(expect.anything(), 'shopify', 'page-1', {
      shopifyCredentials: { shop: 'demo.myshopify.com', accessToken: 'access-token' },
      shopifyMapping: {
        shop: 'demo.myshopify.com',
        ownerId: 'owner-1',
        pageId: 'page-1',
        generation: 4,
      },
      clearShopifyCatalogSyncState: true,
    })
  })

  it('keeps installed-app catalog sync available after a downgrade', async () => {
    planRef.allowed = false

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(ownerAllows).not.toHaveBeenCalled()
    expect(getShopifyInstallCredentialsByShop).toHaveBeenCalled()
    expect(syncPageIntegration).toHaveBeenCalled()
  })

  it('fails closed while a relink or uninstall lease is active', async () => {
    vi.mocked(getInstallByShop).mockResolvedValueOnce({
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      scope: 'read_products',
      uninstalled_at: null,
      mapping_generation: 5,
      mapping_transition_token: 'lease-1',
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(getShopifyInstallCredentialsByShop).not.toHaveBeenCalled()
    expect(syncPageIntegration).not.toHaveBeenCalled()
  })
})
