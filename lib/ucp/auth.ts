import 'server-only'
import { authorizeInboundRequest, readIdempotencyKey } from '../commerce/inbound-auth'
import { ucpError, type UcpError } from './wire'

// UCP inbound auth over the shared SF5 fail-closed guard. UCP endpoints are hosted BY
// the merchant and called by Google with an M2M access token (Authorization: Bearer).
// DORMANT until UCP_SHARED_SECRET is set at enrollment — every request 401s, so this
// is never an unauthenticated charge endpoint.
//
// v1 verifies the Bearer M2M token. AP2 mandate JWT verification (ECDSA verifiable
// credentials, keyed by Google's signing keys) is the deeper payment-authorization
// layer; it arrives at enrollment (owner-blocked) and layers on later — the Bearer
// alone is a fail-closed gate today.

export function ucpSharedSecret(): string | null {
  return process.env.UCP_SHARED_SECRET || null
}

export type UcpAuthResult =
  | { ok: true; idempotencyKey: string | null }
  | { ok: false; status: number; error: UcpError }

/** Verify an inbound UCP request. Fail-closed: no configured secret → 401. */
export function verifyUcpRequest(request: Request, rawBody: string): UcpAuthResult {
  const auth = authorizeInboundRequest(request, rawBody, { secret: ucpSharedSecret(), mode: 'bearer' })
  if (!auth.ok) {
    return { ok: false, status: auth.status, error: ucpError('unauthorized', auth.reason, undefined, 'authentication_error') }
  }
  return { ok: true, idempotencyKey: readIdempotencyKey(request) }
}
