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
import { verifyAcpRequest } from '../../../../../lib/acp/auth'
import { ACP_API_VERSION } from '../../../../../lib/acp/constants'
import { parseAcpLineItems, parseAcpBuyer, toAcpCheckoutSession, acpError } from '../../../../../lib/acp/wire'
import { acpJson, loadAcpPage, loadAcpPageName } from '../../../../../lib/server/acp-session'

/**
 * ACP: POST /api/acp/checkout_sessions/{id} — update a session.
 * Re-prices against the LIVE page (a sold-out/price-changed offer flips the status),
 * optionally replaces line_items and/or buyer, persists the snapshot. Terminal /
 * expired sessions are rejected.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'acp-session', 60, 60_000, { failClosed: true })
  if (limited) return limited
  const { id } = await ctx.params

  const raw = await request.text()
  const auth = verifyAcpRequest(request, raw)
  if (!auth.ok) return acpJson(auth.error, auth.status, ACP_API_VERSION)
  const apiVersion = auth.apiVersion

  if (!hasSupabaseAdminEnv()) {
    return acpJson(acpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503, apiVersion)
  }
  const admin = createAdminClient()
  const row = await loadSessionRow(admin, id)
  if (!row || row.channel !== 'acp') {
    return acpJson(acpError('not_found', 'No such checkout session.', undefined, 'not_found'), 404, apiVersion)
  }
  if (row.status === 'completed' || row.status === 'canceled' || row.status === 'expired') {
    return acpJson(acpError('session_terminal', `Session is ${row.status} and can no longer be updated.`, undefined, 'processing_error'), 409, apiVersion)
  }
  if (isSessionExpired(row)) {
    await markSessionExpired(admin, id)
    return acpJson(acpError('session_expired', 'This checkout session has expired.', undefined, 'processing_error'), 409, apiVersion)
  }

  let body: { line_items?: unknown; buyer?: unknown }
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return acpJson(acpError('invalid_json', 'Request body must be valid JSON.'), 400, apiVersion)
  }

  const page = await loadAcpPage(row.slug)
  if (!page) {
    return acpJson(acpError('merchant_not_found', 'This merchant is no longer available.', undefined, 'not_found'), 404, apiVersion)
  }

  let items: RequestedLineItem[] | undefined
  if (body.line_items !== undefined) {
    const parsed = parseAcpLineItems(body.line_items)
    if (!parsed.ok) return acpJson(parsed.error, 400, apiVersion)
    // Cannot switch the session's merchant on an update.
    if (parsed.slug !== row.slug) {
      return acpJson(acpError('mixed_merchant', 'Cannot change the session merchant.', '$.line_items[0].id'), 400, apiVersion)
    }
    items = parsed.items
  }
  const buyer = body.buyer !== undefined ? parseAcpBuyer(body.buyer) : undefined

  const updated = updateSession(rowToSession(row, page.name), { page, items, buyer })
  await updateSessionSnapshot(admin, id, updated)
  return acpJson(toAcpCheckoutSession(updated), 200, apiVersion)
}

/** ACP: GET /api/acp/checkout_sessions/{id} — return the persisted snapshot. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = verifyAcpRequest(request, '')
  if (!auth.ok) return acpJson(auth.error, auth.status, ACP_API_VERSION)
  const apiVersion = auth.apiVersion

  if (!hasSupabaseAdminEnv()) {
    return acpJson(acpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503, apiVersion)
  }
  const row = await loadSessionRow(createAdminClient(), id)
  if (!row || row.channel !== 'acp') {
    return acpJson(acpError('not_found', 'No such checkout session.', undefined, 'not_found'), 404, apiVersion)
  }
  const name = (await loadAcpPageName(row.slug)) || row.slug
  return acpJson(toAcpCheckoutSession(rowToSession(row, name)), 200, apiVersion)
}
