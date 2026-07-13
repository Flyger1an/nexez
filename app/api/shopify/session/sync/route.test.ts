import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))
vi.mock('../../../../../lib/server/shopify', () => ({
  shopifyConfigured: vi.fn(() => true),
  verifyShopifySessionToken: vi.fn(),
}))
vi.mock('../../../../../lib/server/shopify-install', () => ({
  getInstallByShop: vi.fn(),
  getShopifyInstallCredentialsByShop: vi.fn(),
  markShopifySynced: vi.fn(),
}))
vi.mock('../../../../../lib/server/integration-sync', () => ({
  syncPageIntegration: vi.fn(),
}))
vi.mock('../../../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
  hasSupabaseAdminEnv: vi.fn(() => true),
}))

import { POST } from './route'
import { ownerAllows } from '../../../../../lib/server/plan'
import { verifyShopifySessionToken } from '../../../../../lib/server/shopify'
import {
  getInstallByShop,
  getShopifyInstallCredentialsByShop,
  markShopifySynced,
} from '../../../../../lib/server/shopify-install'
import { syncPageIntegration } from '../../../../../lib/server/integration-sync'

const request = () => new Request('https://app.nexez.ai/api/shopify/session/sync', {
  method: 'POST',
  headers: { authorization: 'Bearer session-token' },
})

describe('POST /api/shopify/session/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ownerAllows).mockResolvedValue(true)
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
  })

  it('requires a valid Shopify session token', async () => {
    vi.mocked(verifyShopifySessionToken).mockReturnValue(null)
    expect((await POST(request())).status).toBe(401)
  })

  it('returns a stable billing gate instead of attempting sync when integrations are disabled', async () => {
    vi.mocked(ownerAllows).mockResolvedValue(false)
    const response = await POST(request())
    expect(response.status).toBe(402)
    expect(await response.json()).toMatchObject({ code: 'billing_required' })
    expect(syncPageIntegration).not.toHaveBeenCalled()
  })

  it('syncs only the shop proven by the App Bridge token', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, imported: 12 })
    expect(getShopifyInstallCredentialsByShop).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com')
    expect(syncPageIntegration).toHaveBeenCalledWith(expect.anything(), 'shopify', 'page-1', {
      shopifyCredentials: { shop: 'demo.myshopify.com', accessToken: 'access-token' },
    })
    expect(markShopifySynced).toHaveBeenCalledWith(expect.anything(), 'page-1', expect.any(String), {
      shop: 'demo.myshopify.com',
      clearCatalogSyncState: true,
    })
  })
})
