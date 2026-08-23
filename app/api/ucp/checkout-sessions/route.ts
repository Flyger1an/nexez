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
import { verifyUcpRequest } from '../../../../lib/ucp/auth'
import { parseUcpLineItems, parseUcpBuyer, toUcpCheckoutSession, ucpError } from '../../../../lib/ucp/wire'
import { ucpJson, loadUcpPage, loadUcpPageName, isMerchantPaused } from '../../../../lib/server/ucp-session'

/**
 * UCP: POST /api/ucp/checkout-sessions - create a checkout session.
 * Body: { line_items: [{ item: { id: "<slug>:<offer>" }, quantity }], buyer? }.
 * Single-merchant guard, paused-seller gate, price via the SF1 core, persist the SF3
 * snapshot (channel 'ucp'), return the UCP session. Fail-closed (dormant until
 * UCP_SHARED_SECRET). Idempotency-Key replays.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'ucp-session', 60, 60_000, { failClosed: true })
  if (limited) return limited

  const raw = await request.text()
  const auth = verifyUcpRequest(request, raw)
  if (!auth.ok) return ucpJson(auth.error, auth.status)

  let body: { line_items?: unknown; buyer?: unknown; contact?: unknown; billing_address?: unknown }
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return ucpJson(ucpError('invalid_json', 'Request body must be valid JSON.'), 400)
  }

  const parsed = parseUcpLineItems(body.line_items)
  if (!parsed.ok) return ucpJson(parsed.error, 400)

  if (auth.idempotencyKey && hasSupabaseAdminEnv()) {
    const existing = await findSessionByIdempotencyKey(createAdminClient(), 'ucp', auth.idempotencyKey)
    if (existing) {
      const name = (await loadUcpPageName(existing.slug)) || existing.slug
      return ucpJson(toUcpCheckoutSession(rowToSession(existing, name)), 201)
    }
  }

  const page = await loadUcpPage(parsed.slug)
  if (!page) {
    return ucpJson(ucpError('merchant_not_found', 'No such merchant or listing.', 'line_items', 'not_found'), 404)
  }
  if (await isMerchantPaused(page.owner_id)) {
    return ucpJson(ucpError('merchant_unavailable', 'This merchant is not accepting orders right now.', undefined, 'processing_error'), 409)
  }

  const session = createSession({ id: randomUUID(), page, items: parsed.items, buyer: parseUcpBuyer(body) })

  if (!hasSupabaseAdminEnv()) {
    return ucpJson(ucpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503)
  }
  const persisted = await persistSession(createAdminClient(), session, {
    channel: 'ucp',
    pageId: page.id,
    ownerId: page.owner_id ?? null,
    idempotencyKey: auth.idempotencyKey,
    expiresAt: defaultSessionExpiry(),
  })
  if (!persisted) {
    return ucpJson(ucpError('persist_failed', 'Could not create the checkout session.', undefined, 'processing_error'), 500)
  }

  return ucpJson(toUcpCheckoutSession(session), 201)
}
