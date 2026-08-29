import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: () => {}, get: () => undefined, delete: () => {} })) }))

import { GET } from './route'

const req = (shop = 'demo.myshopify.com') =>
  new Request(`https://app.nexez.ai/api/shopify/auth?shop=${encodeURIComponent(shop)}`)

describe('GET /api/shopify/auth (inert until configured)', () => {
  beforeEach(() => vi.unstubAllEnvs())

  it('404 when Shopify is not configured', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', '')
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect((await GET(req())).status).toBe(404)
  })

  it('400 on a non-myshopify shop (SSRF pin) when configured', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    expect((await GET(req('evil.example.com'))).status).toBe(400)
  })

  it('302 → Shopify authorize for a valid shop', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    const res = await GET(req('demo.myshopify.com'))
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location') || '')
    expect(location.origin).toBe('https://demo.myshopify.com')
    expect(location.pathname).toBe('/admin/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe('k')
    expect(location.searchParams.get('scope')?.split(',')).toEqual(['read_products', 'read_product_listings', 'write_app_proxy'])
  })
})
