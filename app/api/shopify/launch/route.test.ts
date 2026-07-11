import { describe, it, expect, vi, beforeEach } from 'vitest'

let configured = true
vi.mock('../../../../lib/server/shopify', () => ({ shopifyConfigured: () => configured }))

import { GET } from './route'

const req = (shop?: string) =>
  new Request(`https://app.nexez.ai/api/shopify/launch${shop !== undefined ? `?shop=${encodeURIComponent(shop)}` : ''}`)

describe('GET /api/shopify/launch', () => {
  beforeEach(() => {
    configured = true
  })

  it('404 when Shopify is not configured', async () => {
    configured = false
    expect((await GET(req('demo.myshopify.com'))).status).toBe(404)
  })

  it('routes a valid shop into the OAuth→link flow', async () => {
    const res = await GET(req('demo.myshopify.com'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/api/shopify/auth?shop=demo.myshopify.com')
  })

  it('falls back to the dashboard when there is no / an invalid shop', async () => {
    expect((await GET(req())).headers.get('location')).toMatch(/\/dashboard$/)
    expect((await GET(req('evil.example.com'))).headers.get('location')).toMatch(/\/dashboard$/)
  })
})
