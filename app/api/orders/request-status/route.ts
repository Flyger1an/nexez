import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

/**
 * Owner triage of a buyer-filed order request (acknowledge / resolve / decline). The
 * actual money movement is the separate /api/orders/refund action. This route verifies
 * ownership through RLS, then uses the server-only writer so the activity trigger can
 * append the transition. Unlisted /api/* canonicalizes to the app host.
 */
const ALLOWED = new Set(['acknowledged', 'resolved', 'declined'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'order-request-status', 30, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Order operations are not enabled on this deployment.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string }
  const id = String(body.id || '').trim()
  const status = String(body.status || '').trim()
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'A valid request id is required.' }, { status: 400 })
  if (!ALLOWED.has(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })

  // Verify ownership through the caller's RLS-scoped client, then write with the
  // server-only client so the append-only activity trigger can record the change.
  const { data: owned, error: ownershipError } = await supabase
    .from('order_requests')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle<{ id: string }>()
  if (ownershipError) return NextResponse.json({ error: 'Could not verify the request.' }, { status: 500 })
  if (!owned) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })

  const { data, error } = await createAdminClient()
    .from('order_requests')
    .update({ status })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) return NextResponse.json({ error: 'Could not update the request.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, status })
}
