import 'server-only'
import crypto from 'node:crypto'

/**
 * Shopify app plumbing (config + the three HMAC schemes Shopify uses). The whole
 * Shopify surface is DORMANT until both SHOPIFY_API_KEY and SHOPIFY_API_SECRET
 * are set — every route calls `shopifyConfigured()` and fails closed (404/401)
 * without them, so this is inert in production until the owner wires their
 * Partner-app credentials. No secrets are logged.
 */

export const SHOPIFY_API_VERSION = '2026-07'
export const SHOPIFY_SCOPES = 'read_products,write_app_proxy'

/** True only when both the client id + secret are present. */
export function shopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET)
}

export function shopifyApiKey(): string {
  return process.env.SHOPIFY_API_KEY || ''
}

function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Webhook verification: `X-Shopify-Hmac-Sha256` = base64 HMAC-SHA256 of the RAW
 * request body keyed by the app secret.
 */
export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null | undefined): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret || !hmacHeader) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    return timingSafeEqualBuf(Buffer.from(digest, 'base64'), Buffer.from(hmacHeader, 'base64'))
  } catch {
    return false
  }
}

/**
 * OAuth callback verification: `hmac` (hex) = HMAC-SHA256 of the sorted query
 * params (all except `hmac`/`signature`), joined `k=v&k=v`, keyed by the secret.
 */
export function verifyShopifyOAuthHmac(params: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  const provided = params.get('hmac')
  if (!secret || !provided) return false
  const keys = [...new Set([...params.keys()])].filter((k) => k !== 'hmac' && k !== 'signature').sort()
  const message = keys.map((k) => `${k}=${params.getAll(k).join(',')}`).join('&')
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex')
  try {
    return timingSafeEqualBuf(Buffer.from(digest, 'hex'), Buffer.from(provided, 'hex'))
  } catch {
    return false
  }
}

const MYSHOPIFY_RE = /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/

/**
 * Sign a "pending shop" token after a verified OAuth so the post-install linking
 * flow can prove THIS browser just installed THIS shop (an HMAC-signed cookie the
 * client can't forge). Value: `shop|ts|sig`.
 */
export function signPendingShop(shop: string): string {
  const secret = process.env.SHOPIFY_API_SECRET || ''
  const ts = String(Date.now())
  const sig = crypto.createHmac('sha256', secret).update(`${shop}|${ts}`).digest('hex')
  return `${shop}|${ts}|${sig}`
}

/**
 * Verify + read a pending-shop token: valid signature, not expired, and a real
 * myshopify host. Returns the shop or null. The signature (keyed by the app
 * secret) is what authorizes the later shop→listing link — a client can't mint one.
 */
export function readPendingShop(value: string | null | undefined, maxAgeMs = 60 * 60 * 1000): string | null {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!value || !secret) return null
  const parts = value.split('|')
  if (parts.length !== 3) return null
  const [shop, ts, sig] = parts
  const expect = crypto.createHmac('sha256', secret).update(`${shop}|${ts}`).digest('hex')
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expect, 'hex')
    if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const age = Date.now() - Number(ts)
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null
  return MYSHOPIFY_RE.test(shop) ? shop : null
}

/**
 * App Proxy verification: `signature` (hex) = HMAC-SHA256 of the sorted query
 * params (all except `signature`), CONCATENATED `k=vk=v` (no separator), keyed by
 * the secret.
 */
export function verifyShopifyAppProxySignature(params: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  const provided = params.get('signature')
  if (!secret || !provided) return false
  const keys = [...new Set([...params.keys()])].filter((k) => k !== 'signature').sort()
  const message = keys.map((k) => `${k}=${params.getAll(k).join(',')}`).join('')
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex')
  try {
    return timingSafeEqualBuf(Buffer.from(digest, 'hex'), Buffer.from(provided, 'hex'))
  } catch {
    return false
  }
}
