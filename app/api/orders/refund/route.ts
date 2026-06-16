import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { enforceRateLimit } from '../../../../lib/rate-limit'

/**
 * Owner-initiated refund of a DIRECT checkout order (the negotiation/escrow refund
 * lives in /api/negotiations/escrow). Authenticated owner → RLS confirms the order
 * is theirs + status 'paid' → refund on the connected account WITH
 * refund_application_fee so Nexez's commission comes back too → mark refunded
 * (idempotency-keyed; the charge.refunded webhook reconciles the same row, so the
 * two can't double-refund). Unlisted /api/* canonicalizes to the app host, so this
 * dashboard action keeps the owner session.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'order-refund', 20, 60_000)
  if (limited) return limited

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return NextResponse.json({ error: 'Payments are not enabled on this deployment.' }, { status: 412 })

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { orderId?: string }
  const orderId = String(body.orderId || '').trim()
  if (!orderId) return NextResponse.json({ error: 'orderId is required.' }, { status: 400 })

  // RLS scopes SELECT to the owner's own orders, so a foreign orderId reads as null.
  const { data: order } = await supabase
    .from('checkout_orders')
    .select('id, status, stripe_payment_intent_id, stripe_connect_account_id, metadata')
    .eq('id', orderId)
    .maybeSingle<{
      id: string
      status: string
      stripe_payment_intent_id: string | null
      stripe_connect_account_id: string | null
      metadata: Record<string, unknown> | null
    }>()
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'Only a paid order can be refunded.' }, { status: 409 })
  if (!order.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'This order has no captured payment to refund yet.' }, { status: 409 })
  }

  const stripe = new Stripe(secret)
  const stripeAccount = order.stripe_connect_account_id || undefined
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: order.stripe_payment_intent_id, refund_application_fee: true },
      { ...(stripeAccount ? { stripeAccount } : {}), idempotencyKey: `refund-order-${order.id}` },
    )
    if (hasSupabaseAdminEnv()) {
      await createAdminClient()
        .from('checkout_orders')
        .update({
          status: 'refunded',
          updated_at: new Date().toISOString(),
          metadata: {
            ...((order.metadata as Record<string, unknown>) || {}),
            refund: { id: refund.id, amount_cents: refund.amount ?? null, source: 'owner_action', at: new Date().toISOString() },
          },
        })
        .eq('id', order.id)
    }
    return NextResponse.json({ ok: true, status: 'refunded', refundId: refund.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Refund failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
