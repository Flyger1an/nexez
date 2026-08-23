import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  configured: true,
  signatureValid: true,
  adminConfigured: true,
  integrationsAllowed: true,
  entitlementError: false,
  shop: 'demo.myshopify.com' as string | null,
  install: {
    shop_domain: 'demo.myshopify.com',
    owner_id: 'owner-1',
    page_id: 'page-1',
    uninstalled_at: null,
    mapping_generation: 2,
    mapping_transition_token: null,
  } as any,
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
  activeShopifyInstallMapping: (install: any) => install?.mapping_generation && !install.mapping_transition_token && install.owner_id && install.page_id
    ? { shop: install.shop_domain, ownerId: install.owner_id, pageId: install.page_id, generation: install.mapping_generation }
    : null,
  getInstallByShop: async () => state.install,
}))

vi.mock('./plan', () => ({
  ownerAllows: async () => {
    if (state.entitlementError) throw new Error('entitlement lookup failed')
    return state.integrationsAllowed
  },
}))

vi.mock('../site', () => ({
  agentRuntimeUrl: (path: string) => `https://nexez.app${path}`,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => state.adminConfigured,
  createAdminClient: () => {
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: state.slug ? { slug: state.slug } : null }),
    }
    return { from: () => query }
  },
}))

import { handleShopifyProxy } from './shopify-proxy'

const request = (artifact?: string) =>
  new Request(`https://app.nexez.ai/api/shopify/proxy?shop=demo.myshopify.com${artifact ? `&artifact=${artifact}` : ''}`)

describe('handleShopifyProxy', () => {
  beforeEach(() => {
    state.configured = true
    state.signatureValid = true
    state.adminConfigured = true
    state.integrationsAllowed = true
    state.entitlementError = false
    state.shop = 'demo.myshopify.com'
    state.install = {
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      uninstalled_at: null,
      mapping_generation: 2,
      mapping_transition_token: null,
    }
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

  it('keeps signed installed-app artifacts available below Pro', async () => {
    state.integrationsAllowed = false
    const response = await handleShopifyProxy(request())
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://nexez.app/demo-listing/agent.json')
  })

  it('does not consult the premium entitlement resolver for a signed install', async () => {
    state.entitlementError = true
    const response = await handleShopifyProxy(request())
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://nexez.app/demo-listing/agent.json')
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

    state.install = { ...state.install, owner_id: null, page_id: 'page-1' }
    expect((await handleShopifyProxy(request())).status).toBe(404)

    state.install = {
      shop_domain: 'demo.myshopify.com',
      owner_id: 'owner-1',
      page_id: 'page-1',
      uninstalled_at: null,
      mapping_generation: 3,
      mapping_transition_token: 'lease-1',
    }
    expect((await handleShopifyProxy(request())).status).toBe(404)
  })
})
