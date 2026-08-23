import { NextResponse } from 'next/server'
import { FULFILLMENT_STATUSES, type FulfillmentStatus } from '../../../../../lib/order-operations'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../../lib/server/request-auth'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED = new Set<string>(FULFILLMENT_STATUSES)

type FulfillmentRow = {
  order_id: string
  status: FulfillmentStatus
  version: number
  started_at: string | null
  fulfilled_at: string | null
  updated_at: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await enforceRateLimit(request, 'order-fulfillment', 30, 60_000, { failClosed: true })
  if (limited) return limited

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'A valid order id is required.' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as { status?: string }
  const status = String(body.status || '').trim()
  if (!ALLOWED.has(status)) return NextResponse.json({ error: 'Invalid fulfillment status.' }, { status: 400 })

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Order operations are not enabled on this deployment.' }, { status: 503 })
  }

  const { data: order, error: orderError } = await supabase
    .from('checkout_orders')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle<{ id: string }>()
  if (orderError) return NextResponse.json({ error: 'Could not verify this order.' }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  const { data, error } = await createAdminClient().rpc('transition_checkout_order_fulfillment', {
    p_order_id: order.id,
    p_owner_id: user.id,
    p_status: status,
    p_actor_user_id: user.id,
  })

  if (error) {
    const code = String(error.code || '')
    if (code === '22023') return NextResponse.json({ error: 'Invalid fulfillment status.' }, { status: 400 })
    if (code === 'P0002') return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    if (code === '23514') return NextResponse.json({ error: error.message || 'This fulfillment change is not allowed.' }, { status: 409 })
    return NextResponse.json({ error: 'Could not update fulfillment.' }, { status: 500 })
  }

  const row = (Array.isArray(data) ? data[0] : data) as FulfillmentRow | null
  if (!row) return NextResponse.json({ error: 'Could not confirm fulfillment state.' }, { status: 500 })
  return NextResponse.json({ ok: true, fulfillment: row })
}
