import 'server-only'
import crypto from 'node:crypto'

// Fail-closed inbound authentication + idempotency seam (SF5) for the agentic-commerce
// endpoints (ACP/UCP). These are NEW money-bearing public surfaces, so the posture
// mirrors the Shopify webhook: DORMANT until a shared secret is configured, and any
// request that isn't cryptographically proven is rejected. Two credential schemes are
// supported (a protocol may use either):
//   - Bearer: `Authorization: Bearer <token>`, constant-time compared to the secret.
//   - Signed payload: hex HMAC-SHA256 over `${timestamp}.${rawBody}`, keyed by the
//     secret, inside a replay-tolerance window (Stripe/Svix-style).
//
// The verification primitives are pure (secret + headers passed in) so they unit-test
// without env; the route resolves the appropriate per-protocol secret and passes it.
// No secret is ever logged.

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/** Constant-time bearer-token check. False for any missing/empty input (fail closed). */
export function verifyBearerToken(providedToken: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !providedToken) return false
  return timingSafeEqualUtf8(providedToken, secret)
}

export type SignedPayloadHeaders = {
  timestamp: string | null | undefined
  signature: string | null | undefined
}

/** Default replay window: reject a signed request whose timestamp is more than this
 * many seconds from now (in either direction). */
export const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300

/**
 * Verify a signed payload: hex HMAC-SHA256 over `${timestamp}.${rawBody}`, keyed by
 * the secret, within the replay-tolerance window. Constant-time comparison; false on
 * any missing input, non-numeric/stale timestamp, or signature mismatch.
 */
export function verifySignedPayload(
  rawBody: string,
  headers: SignedPayloadHeaders,
  secret: string | null | undefined,
  opts: { toleranceSeconds?: number; nowMs?: number } = {},
): boolean {
  if (!secret || !headers.signature || !headers.timestamp) return false
  const timestamp = Number(headers.timestamp)
  if (!Number.isFinite(timestamp)) return false
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000)
  const tolerance = opts.toleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS
  if (Math.abs(nowSec - timestamp) > tolerance) return false // stale / replayed / future-dated
  const expected = crypto.createHmac('sha256', secret).update(`${headers.timestamp}.${rawBody}`).digest('hex')
  return timingSafeEqualHex(expected, headers.signature)
}

export type InboundAuthConfig = {
  /** The shared secret for THIS protocol (route resolves it from env). Null/empty =>
   * the surface is dormant and every request is rejected. */
  secret: string | null | undefined
  /** Which credential(s) to accept. Default `either`. */
  mode?: 'bearer' | 'signature' | 'either'
  /** Header carrying the hex HMAC signature (default `x-nexez-signature`). */
  signatureHeader?: string
  /** Header carrying the unix-seconds timestamp (default `x-nexez-timestamp`). */
  timestampHeader?: string
  toleranceSeconds?: number
  nowMs?: number
}

export type InboundAuthResult = { ok: true } | { ok: false; status: number; reason: string }

/**
 * The fail-closed inbound guard a protocol route calls before doing anything. Rejects
 * (401) when no secret is configured (dormant surface) and when neither an accepted
 * bearer token nor a valid signed payload is present. Returns `{ ok: true }` only on a
 * cryptographically proven request.
 */
export function authorizeInboundRequest(request: Request, rawBody: string, config: InboundAuthConfig): InboundAuthResult {
  if (!config.secret) {
    // Dormant surface: no configured credential → nothing is authorized.
    return { ok: false, status: 401, reason: 'inbound_auth_not_configured' }
  }
  const mode = config.mode ?? 'either'

  const bearerOk = mode !== 'signature' && verifyBearerToken(readBearerToken(request), config.secret)
  const signatureOk =
    mode !== 'bearer' &&
    verifySignedPayload(
      rawBody,
      {
        timestamp: request.headers.get(config.timestampHeader ?? 'x-nexez-timestamp'),
        signature: request.headers.get(config.signatureHeader ?? 'x-nexez-signature'),
      },
      config.secret,
      { toleranceSeconds: config.toleranceSeconds, nowMs: config.nowMs },
    )

  if (bearerOk || signatureOk) return { ok: true }
  return { ok: false, status: 401, reason: 'inbound_auth_failed' }
}

// Idempotency-Key: RFC-draft header agents send so a retried create/complete is not
// re-executed. Charset per the draft (token chars); length-bounded. The DB-backed
// replay store lands with the session-persistence migration (SF3) - this seam just
// extracts + validates the key so a route can key its idempotency lookup on it.
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._~:-]{1,255}$/

/** Read + validate the `Idempotency-Key` header. Returns null when absent/malformed. */
export function readIdempotencyKey(request: Request): string | null {
  const value = (request.headers.get('idempotency-key') || '').trim()
  return value && IDEMPOTENCY_KEY_RE.test(value) ? value : null
}
