import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyShopifySessionToken } from './shopify'

function sessionToken(overrides: Record<string, unknown> = {}, secret = 'shopify-secret') {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://demo.myshopify.com/admin',
      dest: 'https://demo.myshopify.com',
      aud: 'shopify-client',
      sub: '42',
      exp: now + 60,
      nbf: now - 1,
      iat: now,
      sid: 'session-1',
      ...overrides,
    }),
  ).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

describe('verifyShopifySessionToken', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('accepts a valid, short-lived Shopify App Bridge token', () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'shopify-client')
    vi.stubEnv('SHOPIFY_API_SECRET', 'shopify-secret')

    expect(verifyShopifySessionToken(sessionToken())).toMatchObject({
      shop: 'demo.myshopify.com',
      userId: '42',
      sessionId: 'session-1',
    })
  })

  it('rejects bad signatures, audiences, expiry, and non-Shopify destinations', () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'shopify-client')
    vi.stubEnv('SHOPIFY_API_SECRET', 'shopify-secret')
    const now = Math.floor(Date.now() / 1000)

    expect(verifyShopifySessionToken(sessionToken({}, 'wrong-secret'))).toBeNull()
    expect(verifyShopifySessionToken(sessionToken({ aud: 'another-client' }))).toBeNull()
    expect(verifyShopifySessionToken(sessionToken({ iat: now - 120, nbf: now - 120, exp: now - 60 }))).toBeNull()
    expect(
      verifyShopifySessionToken(
        sessionToken({ iss: 'https://attacker.example/admin', dest: 'https://attacker.example' }),
      ),
    ).toBeNull()
  })

  it('fails closed when app credentials or token fields are missing', () => {
    vi.stubEnv('SHOPIFY_API_KEY', '')
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect(verifyShopifySessionToken(sessionToken())).toBeNull()

    vi.stubEnv('SHOPIFY_API_KEY', 'shopify-client')
    vi.stubEnv('SHOPIFY_API_SECRET', 'shopify-secret')
    expect(verifyShopifySessionToken(sessionToken({ sid: '' }))).toBeNull()
    expect(verifyShopifySessionToken('not-a-jwt')).toBeNull()
  })
})
