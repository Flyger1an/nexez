import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'

/**
 * Owner triage of a buyer-filed order request (acknowledge / resolve / decline). The
 * actual money movement is the separate /api/orders/refund action - this only tracks
 * the request's state. RLS scopes the UPDATE to the owner's own rows, so a foreign id
 * updates nothing. Unlisted /api/* canonicalizes to the app host (owner session).
 */
const ALLOWED = new Set(['acknowledged', 'resolved', 'declined'])

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'order-request-status', 30, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string }
  const id = String(body.id || '').trim()
  const status = String(body.status || '').trim()
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  if (!ALLOWED.has(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })

  // RLS update policy restricts to (auth.uid() = owner_id); select back to confirm a
  // row actually changed (else a foreign / missing id silently no-ops).
  const { data, error } = await supabase
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
