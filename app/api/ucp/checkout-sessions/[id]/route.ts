import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { updateSession, type RequestedLineItem } from '../../../../../lib/commerce/checkout-session-core'
import {
  loadSessionRow,
  updateSessionSnapshot,
  rowToSession,
  isSessionExpired,
  markSessionExpired,
} from '../../../../../lib/server/checkout-session-store'
import { verifyUcpRequest } from '../../../../../lib/ucp/auth'
import { parseUcpLineItems, parseUcpBuyer, toUcpCheckoutSession, ucpError } from '../../../../../lib/ucp/wire'
import { ucpJson, loadUcpPage, loadUcpPageName } from '../../../../../lib/server/ucp-session'

/**
 * UCP: PUT /api/ucp/checkout-sessions/{id} — update (recalc on address/cart change).
 * Re-prices against the live page, optionally replaces line_items/buyer, rejects
 * terminal/expired sessions. (UCP uses PUT for update, unlike ACP's POST.)
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'ucp-session', 60, 60_000, { failClosed: true })
  if (limited) return limited
  const { id } = await ctx.params

  const raw = await request.text()
  const auth = verifyUcpRequest(request, raw)
  if (!auth.ok) return ucpJson(auth.error, auth.status)

  if (!hasSupabaseAdminEnv()) {
    return ucpJson(ucpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503)
  }
  const admin = createAdminClient()
  const row = await loadSessionRow(admin, id)
  if (!row || row.channel !== 'ucp') {
    return ucpJson(ucpError('not_found', 'No such checkout session.', undefined, 'not_found'), 404)
  }
  if (row.status === 'completed' || row.status === 'canceled' || row.status === 'expired') {
    return ucpJson(ucpError('session_terminal', `Session is ${row.status} and can no longer be updated.`, undefined, 'processing_error'), 409)
  }
  if (isSessionExpired(row)) {
    await markSessionExpired(admin, id)
    return ucpJson(ucpError('session_expired', 'This checkout session has expired.', undefined, 'processing_error'), 409)
  }

  let body: { line_items?: unknown; buyer?: unknown; contact?: unknown; billing_address?: unknown }
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return ucpJson(ucpError('invalid_json', 'Request body must be valid JSON.'), 400)
  }

  const page = await loadUcpPage(row.slug)
  if (!page) {
    return ucpJson(ucpError('merchant_not_found', 'This merchant is no longer available.', undefined, 'not_found'), 404)
  }

  let items: RequestedLineItem[] | undefined
  if (body.line_items !== undefined) {
    const parsed = parseUcpLineItems(body.line_items)
    if (!parsed.ok) return ucpJson(parsed.error, 400)
    if (parsed.slug !== row.slug) {
      return ucpJson(ucpError('mixed_merchant', 'Cannot change the session merchant.', 'line_items'), 400)
    }
    items = parsed.items
  }
  const buyer = body.buyer !== undefined || body.contact !== undefined || body.billing_address !== undefined ? parseUcpBuyer(body) : undefined

  const updated = updateSession(rowToSession(row, page.name), { page, items, buyer })
  await updateSessionSnapshot(admin, id, updated)
  return ucpJson(toUcpCheckoutSession(updated), 200)
}

/** UCP: GET /api/ucp/checkout-sessions/{id} — return the persisted snapshot. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = verifyUcpRequest(request, '')
  if (!auth.ok) return ucpJson(auth.error, auth.status)

  if (!hasSupabaseAdminEnv()) {
    return ucpJson(ucpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503)
  }
  const admin = createAdminClient()
  const row = await loadSessionRow(admin, id)
  if (!row || row.channel !== 'ucp') {
    return ucpJson(ucpError('not_found', 'No such checkout session.', undefined, 'not_found'), 404)
  }
  const name = (await loadUcpPageName(row.slug)) || row.slug
  return ucpJson(toUcpCheckoutSession(rowToSession(row, name)), 200)
}
