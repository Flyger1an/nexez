import { randomUUID } from 'node:crypto'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { createSession } from '../../../../lib/commerce/checkout-session-core'
import {
  persistSession,
  findSessionByIdempotencyKey,
  rowToSession,
  defaultSessionExpiry,
} from '../../../../lib/server/checkout-session-store'
import { verifyAcpRequest } from '../../../../lib/acp/auth'
import { ACP_API_VERSION } from '../../../../lib/acp/constants'
import { parseAcpLineItems, parseAcpBuyer, toAcpCheckoutSession, acpError } from '../../../../lib/acp/wire'
import { acpJson, loadAcpPage, loadAcpPageName, isMerchantPaused } from '../../../../lib/server/acp-session'

/**
 * ACP: POST /api/acp/checkout_sessions — create a checkout session.
 * Body: { line_items: [{ id: "<slug>:<offer>", quantity }], buyer?, currency? }.
 * Resolves the single merchant, runs the paused-seller gate, prices via the SF1 core,
 * persists the SF3 snapshot (channel 'acp'), returns the ACP CheckoutSession (201).
 * Fail-closed auth (dormant until ACP_SHARED_SECRET). Idempotency-Key replays.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'acp-session', 60, 60_000, { failClosed: true })
  if (limited) return limited

  const raw = await request.text()
  const auth = verifyAcpRequest(request, raw)
  if (!auth.ok) return acpJson(auth.error, auth.status, ACP_API_VERSION)
  const apiVersion = auth.apiVersion

  let body: { line_items?: unknown; buyer?: unknown }
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return acpJson(acpError('invalid_json', 'Request body must be valid JSON.'), 400, apiVersion)
  }

  const parsed = parseAcpLineItems(body.line_items)
  if (!parsed.ok) return acpJson(parsed.error, 400, apiVersion)

  // Idempotency: a replayed create returns the ORIGINAL session, never a second.
  if (auth.idempotencyKey && hasSupabaseAdminEnv()) {
    const existing = await findSessionByIdempotencyKey(createAdminClient(), 'acp', auth.idempotencyKey)
    if (existing) {
      const name = (await loadAcpPageName(existing.slug)) || existing.slug
      return acpJson(toAcpCheckoutSession(rowToSession(existing, name)), 201, apiVersion)
    }
  }

  const page = await loadAcpPage(parsed.slug)
  if (!page) {
    return acpJson(acpError('merchant_not_found', 'No such merchant or listing.', '$.line_items[0].id', 'not_found'), 404, apiVersion)
  }

  if (await isMerchantPaused(page.owner_id)) {
    return acpJson(acpError('merchant_unavailable', 'This merchant is not accepting orders right now.', undefined, 'processing_error'), 409, apiVersion)
  }

  const session = createSession({
    id: randomUUID(),
    page,
    items: parsed.items,
    buyer: parseAcpBuyer(body.buyer),
  })

  // Persistence is required for the id-only update/complete lifecycle; without
  // service-role env the session can't be retrieved later, so refuse rather than
  // hand back an un-completable session.
  if (!hasSupabaseAdminEnv()) {
    return acpJson(acpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503, apiVersion)
  }
  const persisted = await persistSession(createAdminClient(), session, {
    channel: 'acp',
    pageId: page.id,
    ownerId: page.owner_id ?? null,
    idempotencyKey: auth.idempotencyKey,
    apiVersion,
    expiresAt: defaultSessionExpiry(),
  })
  if (!persisted) {
    return acpJson(acpError('persist_failed', 'Could not create the checkout session.', undefined, 'processing_error'), 500, apiVersion)
  }

  return acpJson(toAcpCheckoutSession(session), 201, apiVersion)
}
