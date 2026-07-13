import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

describe('GET /shopify embedded app shell', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('fails closed when Shopify is not configured', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', '')
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect((await GET()).status).toBe(404)
  })

  it('loads current App Bridge before app code and permits only Shopify framing', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'client-id')
    vi.stubEnv('SHOPIFY_API_SECRET', 'super-secret')
    const response = await GET()
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain(
      'frame-ancestors https://admin.shopify.com https://*.myshopify.com',
    )
    expect(html).toContain('<meta name="shopify-api-key" content="client-id">')
    expect(html.indexOf('shopifycloud/app-bridge.js')).toBeLessThan(html.indexOf('(() => {'))
    expect(html).toContain("window.open(url, '_top')")
    expect(html).not.toContain('separate secure tab')
    expect(html).toContain('Storefront agent links become public after your Online Store is unlocked.')
    expect(html).not.toContain('super-secret')
  })
})
