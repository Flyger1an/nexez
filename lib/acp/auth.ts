import 'server-only'
import { authorizeInboundRequest, readIdempotencyKey } from '../commerce/inbound-auth'
import { ACP_API_VERSION } from './constants'
import { acpError, type AcpError } from './wire'

// ACP inbound auth (A2) over the shared SF5 fail-closed guard. ACP endpoints are
// hosted BY the merchant and called by OpenAI with a shared Bearer key — a NEW
// inbound trust boundary distinct from the anonymous public surface. DORMANT until
// ACP_SHARED_SECRET is set at enrollment (every request 401s), so this is never an
// unauthenticated charge endpoint.
//
// v1 verifies the OpenAI→merchant shared Bearer key. ACP also sends a `Signature`
// (base64 HMAC of the raw body) + `Timestamp` for body integrity; that scheme +
// secret arrive out-of-band at enrollment (owner-blocked), so it layers on later —
// the Bearer alone is a fail-closed gate today.

export function acpSharedSecret(): string | null {
  return process.env.ACP_SHARED_SECRET || null
}

export type AcpAuthResult =
  | { ok: true; idempotencyKey: string | null; apiVersion: string }
  | { ok: false; status: number; error: AcpError }

/** Verify an inbound ACP request. Fail-closed: no configured secret → 401. On success
 * returns the captured Idempotency-Key + the negotiated API-Version to echo. */
export function verifyAcpRequest(request: Request, rawBody: string): AcpAuthResult {
  const auth = authorizeInboundRequest(request, rawBody, { secret: acpSharedSecret(), mode: 'bearer' })
  if (!auth.ok) {
    return { ok: false, status: auth.status, error: acpError('unauthorized', auth.reason, undefined, 'authentication_error') }
  }
  return {
    ok: true,
    idempotencyKey: readIdempotencyKey(request),
    apiVersion: request.headers.get('api-version') || ACP_API_VERSION,
  }
}
