import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import {
  SHOPIFY_API_VERSION,
  SHOPIFY_SCOPES,
  shopifyConfigured,
  verifyShopifyWebhookHmac,
  verifyShopifyOAuthHmac,
  verifyShopifyAppProxySignature,
  signPendingShop,
  readPendingShop,
} from '../server/shopify'

const SECRET = 'shpss_testsecret'

beforeEach(() => vi.unstubAllEnvs())

describe('shopify config + HMAC', () => {
  it('uses the current stable API and includes the app-proxy scope', () => {
    expect(SHOPIFY_API_VERSION).toBe('2026-07')
    expect(SHOPIFY_SCOPES.split(',')).toEqual(['read_products', 'read_product_listings', 'write_app_proxy'])
  })

  it('shopifyConfigured requires BOTH key and secret', () => {
    vi.stubEnv('SHOPIFY_API_KEY', '')
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect(shopifyConfigured()).toBe(false)
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    expect(shopifyConfigured()).toBe(false)
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    expect(shopifyConfigured()).toBe(true)
  })

  it('webhook HMAC (base64 over raw body) accepts a correct sig, rejects a forgery, fails closed without a secret', () => {
    vi.stubEnv('SHOPIFY_API_SECRET', SECRET)
    const body = '{"id":123}'
    const good = crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('base64')
    expect(verifyShopifyWebhookHmac(body, good)).toBe(true)
    expect(verifyShopifyWebhookHmac(body, 'AAAAAAAA')).toBe(false)
    expect(verifyShopifyWebhookHmac(body, null)).toBe(false)
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect(verifyShopifyWebhookHmac(body, good)).toBe(false)
  })

  it('OAuth HMAC (hex over sorted k=v&…) verifies + rejects tampering', () => {
    vi.stubEnv('SHOPIFY_API_SECRET', SECRET)
    const p = new URLSearchParams({ code: 'abc', shop: 'demo.myshopify.com', state: 'xyz', timestamp: '1' })
    const msg = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join('&')
    p.set('hmac', crypto.createHmac('sha256', SECRET).update(msg).digest('hex'))
    expect(verifyShopifyOAuthHmac(p)).toBe(true)
    p.set('shop', 'attacker.myshopify.com')
    expect(verifyShopifyOAuthHmac(p)).toBe(false)
  })

  it('App Proxy signature (hex over sorted k=v concatenated) verifies + rejects tampering', () => {
    vi.stubEnv('SHOPIFY_API_SECRET', SECRET)
    const p = new URLSearchParams({ shop: 'demo.myshopify.com', path_prefix: '/apps/nexez', timestamp: '1' })
    const msg = [...p.keys()].sort().map((k) => `${k}=${p.get(k)}`).join('')
    p.set('signature', crypto.createHmac('sha256', SECRET).update(msg).digest('hex'))
    expect(verifyShopifyAppProxySignature(p)).toBe(true)
    p.set('signature', '00')
    expect(verifyShopifyAppProxySignature(p)).toBe(false)
  })

  it('pending-shop token: sign→read roundtrip; rejects tamper, non-myshopify, expiry, no-secret', () => {
    vi.stubEnv('SHOPIFY_API_SECRET', SECRET)
    const shop = 'demo.myshopify.com'
    const tok = signPendingShop(shop)
    expect(readPendingShop(tok)).toBe(shop)

    // tampered signature
    expect(readPendingShop(tok.slice(0, -1) + (tok.endsWith('a') ? 'b' : 'a'))).toBeNull()
    // a validly-signed but non-myshopify host is still rejected (defense in depth)
    expect(readPendingShop(signPendingShop('evil.example.com'))).toBeNull()
    // expired (older than the max age)
    const old = String(Date.now() - 2 * 60 * 60 * 1000)
    const sig = crypto.createHmac('sha256', SECRET).update(`${shop}|${old}`).digest('hex')
    expect(readPendingShop(`${shop}|${old}|${sig}`)).toBeNull()
    // fails closed without a secret
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect(readPendingShop(tok)).toBeNull()
  })
})
