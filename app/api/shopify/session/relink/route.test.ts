import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../../../../test/supabase-mock'

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/shopify', () => ({
  shopifyConfigured: vi.fn(() => true),
  verifyShopifySessionToken: vi.fn(),
}))
vi.mock('../../../../../lib/server/shopify-install', () => ({
  getInstallByShop: vi.fn(),
  issueShopifyLinkToken: vi.fn(async () => 'relink-token'),
}))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))
vi.mock('../../../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(() => true),
}))

import { POST } from './route'
import { verifyShopifySessionToken } from '../../../../../lib/server/shopify'
import { getInstallByShop, issueShopifyLinkToken } from '../../../../../lib/server/shopify-install'
import { createAdminClient } from '../../../../../utils/supabase/admin'
import { ownerAllows } from '../../../../../lib/server/plan'

const request = () => new Request('https://app.nexez.ai/api/shopify/session/relink', {
  method: 'POST',
  headers: { authorization: 'Bearer session-token' },
})

describe('POST /api/shopify/session/relink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifyShopifySessionToken).mockReturnValue({
      shop: 'demo.myshopify.com',
      userId: '42',
      sessionId: 'session-1',
      expiresAt: 9999999999,
    })
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: null, error: null })) as any)
    vi.mocked(getInstallByShop).mockResolvedValue({
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      scope: 'read_products,write_app_proxy',
      uninstalled_at: null,
    })
  })

  it('rejects a request without a valid App Bridge session', async () => {
    vi.mocked(verifyShopifySessionToken).mockReturnValue(null)
    const response = await POST(request())
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns a single-use top-level listing picker URL', async () => {
    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.connectUrl).toContain('/api/shopify/claim?token=relink-token')
    expect(issueShopifyLinkToken).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com')
  })

  it('fails closed when the shop is not installed', async () => {
    vi.mocked(getInstallByShop).mockResolvedValue(null)
    expect((await POST(request())).status).toBe(409)
    expect(issueShopifyLinkToken).not.toHaveBeenCalled()
  })

  it('keeps installed-app relinking available after a downgrade', async () => {
    vi.mocked(ownerAllows).mockResolvedValueOnce(false)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(ownerAllows).not.toHaveBeenCalled()
    expect(issueShopifyLinkToken).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com')
  })

  it('does not issue a relink token for an unlinked install', async () => {
    vi.mocked(getInstallByShop).mockResolvedValueOnce({
      shop_domain: 'demo.myshopify.com',
      owner_id: null,
      page_id: null,
      scope: 'read_products,write_app_proxy',
      uninstalled_at: null,
    })

    expect((await POST(request())).status).toBe(409)
    expect(ownerAllows).not.toHaveBeenCalled()
    expect(issueShopifyLinkToken).not.toHaveBeenCalled()
  })

  it('does not issue another relink token while a mapping change is active', async () => {
    vi.mocked(getInstallByShop).mockResolvedValueOnce({
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      scope: 'read_products,write_app_proxy',
      uninstalled_at: null,
      mapping_generation: 4,
      mapping_transition_token: 'lease-1',
    })

    expect((await POST(request())).status).toBe(409)
    expect(issueShopifyLinkToken).not.toHaveBeenCalled()
  })
})
