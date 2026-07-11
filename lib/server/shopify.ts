import 'server-only'
import crypto from 'node:crypto'

/**
 * Shopify app plumbing (config + the three HMAC schemes Shopify uses). The whole
 * Shopify surface is DORMANT until both SHOPIFY_API_KEY and SHOPIFY_API_SECRET
 * are set — every route calls `shopifyConfigured()` and fails closed (404/401)
 * without them, so this is inert in production until the owner wires their
 * Partner-app credentials. No secrets are logged.
 */

export const SHOPIFY_SCOPES = 'read_products'

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
