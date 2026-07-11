import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  configured: true,
  signatureValid: true,
  adminConfigured: true,
  shop: 'demo.myshopify.com' as string | null,
  install: { page_id: 'page-1' } as { page_id: string } | null,
  slug: 'demo-listing' as string | null,
}))

vi.mock('./shopify', () => ({
  shopifyConfigured: () => state.configured,
  verifyShopifyAppProxySignature: () => state.signatureValid,
}))

vi.mock('./integration-importers', () => ({
  resolveShopDomain: () => state.shop,
}))

vi.mock('./shopify-install', () => ({
  getInstallByShop: async () => state.install,
}))

vi.mock('../site', () => ({
  agentRuntimeUrl: (path: string) => `https://nexez.app${path}`,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => state.adminConfigured,
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.slug ? { slug: state.slug } : null }),
        }),
      }),
    }),
  }),
}))

import { handleShopifyProxy } from './shopify-proxy'

const request = (artifact?: string) =>
  new Request(`https://app.nexez.ai/api/shopify/proxy?shop=demo.myshopify.com${artifact ? `&artifact=${artifact}` : ''}`)

describe('handleShopifyProxy', () => {
  beforeEach(() => {
    state.configured = true
    state.signatureValid = true
    state.adminConfigured = true
    state.shop = 'demo.myshopify.com'
    state.install = { page_id: 'page-1' }
    state.slug = 'demo-listing'
  })

  it('redirects the proxy root to the default agent manifest', async () => {
    const response = await handleShopifyProxy(request())
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://nexez.app/demo-listing/agent.json')
  })

  it('serves an allowlisted child artifact path', async () => {
    const response = await handleShopifyProxy(request(), 'llms.txt')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://nexez.app/demo-listing/llms.txt')
  })

  it('rejects unknown or nested paths instead of becoming an open proxy', async () => {
    expect((await handleShopifyProxy(request(), '../agent.json')).status).toBe(404)
    expect((await handleShopifyProxy(request(), 'agent.json/extra')).status).toBe(404)
  })

  it('fails closed for bad signatures and unlinked shops', async () => {
    state.signatureValid = false
    expect((await handleShopifyProxy(request())).status).toBe(401)

    state.signatureValid = true
    state.install = null
    expect((await handleShopifyProxy(request())).status).toBe(404)
  })
})
