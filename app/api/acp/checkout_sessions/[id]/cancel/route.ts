import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../../utils/supabase/admin'
import { cancelSession } from '../../../../../../lib/commerce/checkout-session-core'
import { loadSessionRow, updateSessionSnapshot, rowToSession } from '../../../../../../lib/server/checkout-session-store'
import { verifyAcpRequest } from '../../../../../../lib/acp/auth'
import { ACP_API_VERSION } from '../../../../../../lib/acp/constants'
import { toAcpCheckoutSession, acpError } from '../../../../../../lib/acp/wire'
import { acpJson, loadAcpPageName } from '../../../../../../lib/server/acp-session'

/**
 * ACP: POST /api/acp/checkout_sessions/{id}/cancel - cancel a session.
 * Idempotent when already canceled; refuses a completed session (a settled order is
 * terminal - it must be refunded, not canceled).
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
  if (row.status === 'completed') {
    return acpJson(acpError('session_terminal', 'Cannot cancel a completed session.', undefined, 'processing_error'), 409, apiVersion)
  }

  const name = (await loadAcpPageName(row.slug)) || row.slug
  const canceled = cancelSession(rowToSession(row, name))
  await updateSessionSnapshot(admin, id, canceled)
  return acpJson(toAcpCheckoutSession(canceled), 200, apiVersion)
}
