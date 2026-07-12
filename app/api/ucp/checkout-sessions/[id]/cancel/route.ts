import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../../utils/supabase/admin'
import { cancelSession } from '../../../../../../lib/commerce/checkout-session-core'
import { loadSessionRow, updateSessionSnapshot, rowToSession } from '../../../../../../lib/server/checkout-session-store'
import { verifyUcpRequest } from '../../../../../../lib/ucp/auth'
import { toUcpCheckoutSession, ucpError } from '../../../../../../lib/ucp/wire'
import { ucpJson, loadUcpPageName } from '../../../../../../lib/server/ucp-session'

/** UCP: POST /api/ucp/checkout-sessions/{id}/cancel — cancel a session (idempotent;
 * refuses a completed one). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
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
  if (row.status === 'completed') {
    return ucpJson(ucpError('session_terminal', 'Cannot cancel a completed session.', undefined, 'processing_error'), 409)
  }

  const name = (await loadUcpPageName(row.slug)) || row.slug
  const canceled = cancelSession(rowToSession(row, name))
  await updateSessionSnapshot(admin, id, canceled)
  return ucpJson(toUcpCheckoutSession(canceled), 200)
}
