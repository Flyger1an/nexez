import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'crypto'

// Stateless, signed, expiring magic-link token for the "find my orders" email lookup.
// Payload = { e: <email>, x: <expiry ms> }, base64url-encoded, with an HMAC-SHA256
// signature. No DB row needed - possession of a valid, unexpired token (delivered only
// to the email's own inbox) authorizes listing that email's orders.
//
// Signing key: a dedicated ORDER_LOOKUP_SECRET if set, else derived (domain-separated)
// from SUPABASE_SERVICE_ROLE_KEY - a strong server-only secret that's always present in
// prod and never reaches the client. Rotating it just invalidates outstanding links
// (they're short-lived anyway). No env setup required.

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function signingKey(): Buffer | null {
  const explicit = process.env.ORDER_LOOKUP_SECRET
  if (explicit) return createHash('sha256').update(`nexez-order-lookup-v1:${explicit}`).digest()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceRole) return createHash('sha256').update(`nexez-order-lookup-v1:${serviceRole}`).digest()
  return null
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** Sign a lookup token for an email. Returns null if no signing key is configured. */
export function signLookupToken(email: string, ttlMs: number = DEFAULT_TTL_MS, nowMs: number = Date.now()): string | null {
  const key = signingKey()
  if (!key) return null
  const payload = b64url(JSON.stringify({ e: email.trim().toLowerCase(), x: nowMs + ttlMs }))
  const sig = createHmac('sha256', key).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Verify a lookup token. Returns the email if the signature is valid and unexpired, else null. */
export function verifyLookupToken(token: string, nowMs: number = Date.now()): string | null {
  const key = signingKey()
  if (!key || !token) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', key).update(payload).digest('base64url')
  // Constant-time compare; mismatched lengths can't be timingSafeEqual'd, so guard.
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; x?: unknown }
    if (typeof parsed.e !== 'string' || typeof parsed.x !== 'number') return null
    if (nowMs > parsed.x) return null
    return parsed.e
  } catch {
    return null
  }
}
