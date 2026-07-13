import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})), hasSupabaseAdminEnv: vi.fn(() => false) }))
vi.mock('../../../../lib/server/shopify-install', () => ({ markUninstalled: vi.fn(), redactShop: vi.fn() }))
vi.mock('../../../../lib/server/shopify-catalog-sync', () => ({
  isShopifyCatalogTopic: (topic: string) => ['products/create', 'products/update', 'products/delete'].includes(topic),
  queueShopifyCatalogSync: vi.fn(async () => true),
}))

import { POST } from './route'
import { hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { markUninstalled, redactShop } from '../../../../lib/server/shopify-install'
import { queueShopifyCatalogSync } from '../../../../lib/server/shopify-catalog-sync'

const req = (headers: Record<string, string> = {}, body = '{}') =>
  new Request('https://nexez.app/api/webhooks/shopify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })

describe('POST /api/webhooks/shopify (inert until configured)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
  })

  it('404 when Shopify is not configured (fail closed)', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', '')
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect((await POST(req())).status).toBe(404)
  })

  it('401 on a bad / absent HMAC when configured', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    expect((await POST(req({ 'x-shopify-hmac-sha256': 'bad' }))).status).toBe(401)
    expect((await POST(req())).status).toBe(401)
  })

  it('wipes an uninstall and deletes the final shop record on shop/redact', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    const body = JSON.stringify({ shop_id: 1, shop_domain: 'demo.myshopify.com' })
    const hmac = crypto.createHmac('sha256', 's').update(body).digest('base64')
    const headers = {
      'x-shopify-hmac-sha256': hmac,
      'x-shopify-shop-domain': 'demo.myshopify.com',
      'x-shopify-topic': 'app/uninstalled',
    }
    expect((await POST(req(headers, body))).status).toBe(200)
    expect(markUninstalled).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com', expect.any(String))

    headers['x-shopify-topic'] = 'shop/redact'
    expect((await POST(req(headers, body))).status).toBe(200)
    expect(redactShop).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com')
  })

  it('returns 503 so Shopify retries a failed lifecycle write', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(markUninstalled).mockRejectedValueOnce(new Error('db unavailable'))
    const body = '{}'
    const hmac = crypto.createHmac('sha256', 's').update(body).digest('base64')
    const response = await POST(req({
      'x-shopify-hmac-sha256': hmac,
      'x-shopify-shop-domain': 'demo.myshopify.com',
      'x-shopify-topic': 'app/uninstalled',
    }, body))
    expect(response.status).toBe(503)
  })

  it('queues product changes and acknowledges before any catalog fetch', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    const body = JSON.stringify({ id: 123, updated_at: '2026-07-13T12:00:00Z' })
    const hmac = crypto.createHmac('sha256', 's').update(body).digest('base64')
    const response = await POST(req({
      'x-shopify-hmac-sha256': hmac,
      'x-shopify-shop-domain': 'demo.myshopify.com',
      'x-shopify-topic': 'products/update',
    }, body))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, queued: true })
    expect(queueShopifyCatalogSync).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com', 'products/update')
  })
})
