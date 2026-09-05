import { NextResponse } from 'next/server'
import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import { hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { executeRefund, validRefundOperationId } from '../../../../lib/server/refund-operation'

// Owner-authenticated direct checkout refund. Postgres reserves a stable operation
// before Stripe is called and serializes every refund against the same order.
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'order-refund', 20, 60_000, { failClosed: true })
  if (limited) return limited

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return NextResponse.json({ error: 'Payments are not enabled on this deployment.' }, { status: 412 })

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Order refunds are not enabled on this deployment.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { orderId?: string; amount?: number; operationId?: string }
  const orderId = String(body.orderId || '').trim()
  if (!orderId) return NextResponse.json({ error: 'orderId is required.' }, { status: 400 })
  // Optional partial amount, in MAJOR units of the page currency (e.g. 30 = $30).
  // Omitted → full remainder. Validated/converted to Stripe units before use.
  const hasAmount = body.amount != null
  if (hasAmount && (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0)) {
    return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 })
  }

  // RLS scopes SELECT to the owner's own orders, so a foreign orderId reads as null.
  const { data: order } = await supabase
    .from('checkout_orders')
    .select('id, status, stripe_payment_intent_id, stripe_connect_account_id, amount_cents, currency, refunded_cents, metadata')
    .eq('id', orderId)
    .maybeSingle<{
      id: string
      status: string
      stripe_payment_intent_id: string | null
      stripe_connect_account_id: string | null
      amount_cents: number | null
      currency: string | null
      refunded_cents: number | null
      metadata: Record<string, unknown> | null
    }>()
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (!validRefundOperationId(body.operationId)) {
    return NextResponse.json({ error: 'A stable refund operationId (UUID v4) is required.' }, { status: 400 })
  }
  return executeRefund({
    operationId: body.operationId, ownerId: user.id, kind: 'order', targetId: order.id,
    currency: order.currency || 'usd', amount: body.amount,
  })
}
