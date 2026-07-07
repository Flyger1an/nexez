import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { toStripeAmount } from '../../../../lib/currency'
import { planRefund, refundIdempotencyKey } from '../../../../lib/refunds'

/**
 * Owner-initiated refund of a DIRECT checkout order (the negotiation/escrow refund
 * lives in /api/negotiations/escrow). Authenticated owner → RLS confirms the order
 * is theirs + status 'paid' → refund on the connected account WITH
 * refund_application_fee so Nexez's commission comes back too (proportional on a
 * partial). Supports PARTIAL refunds: an optional `amount` (major units, page
 * currency) refunds part of the remainder; omit it to refund the full remainder.
 * The cumulative-refunded ledger (refunded_cents) caps each refund on the remainder
 * and keys idempotency on the running total, so equal-amount partials can't collide
 * (the bug that made partials unsafe). A partial keeps the order 'paid' so the
 * remainder stays refundable; only a full refund flips it to 'refunded'. The
 * charge.refunded webhook reconciles refunded_cents to Stripe's authoritative total.
 * Unlisted /api/* canonicalizes to the app host, so this dashboard action keeps the
 * owner session.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'order-refund', 20, 60_000, { failClosed: true })
  if (limited) return limited

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return NextResponse.json({ error: 'Payments are not enabled on this deployment.' }, { status: 412 })

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { orderId?: string; amount?: number }
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
  if (order.status !== 'paid') return NextResponse.json({ error: 'Only a paid order can be refunded.' }, { status: 409 })
  if (!order.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'This order has no captured payment to refund yet.' }, { status: 409 })
  }

  // checkout_orders.amount_cents is already Stripe smallest-unit (session.amount_total),
  // as is refunded_cents - so the ledger math is a direct subtraction (no conversion).
  const plan = planRefund({
    capturedAmount: order.amount_cents ?? 0,
    alreadyRefunded: order.refunded_cents ?? 0,
    requestedAmount: hasAmount ? toStripeAmount(body.amount as number, order.currency || 'usd') : null,
  })
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status })

  const stripe = new Stripe(secret)
  const stripeAccount = order.stripe_connect_account_id || undefined
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: order.stripe_payment_intent_id, amount: plan.refundAmount, refund_application_fee: true },
      { ...(stripeAccount ? { stripeAccount } : {}), idempotencyKey: refundIdempotencyKey('refund-order', order.id, plan.newTotal) },
    )
    if (hasSupabaseAdminEnv()) {
      const now = new Date().toISOString()
      const meta = (order.metadata as Record<string, unknown>) || {}
      await createAdminClient()
        .from('checkout_orders')
        .update({
          // A partial keeps the order 'paid' (remainder still refundable); only a
          // full refund closes it. refunded_cents is the running cumulative total.
          ...(plan.fully ? { status: 'refunded' } : {}),
          refunded_cents: plan.newTotal,
          updated_at: now,
          metadata: plan.fully
            ? { ...meta, refund: { id: refund.id, amount_cents: plan.newTotal, source: 'owner_action', at: now } }
            : { ...meta, partial_refund: { last_refund_id: refund.id, amount_cents: plan.newTotal, source: 'owner_action', at: now } },
        })
        .eq('id', order.id)
    }
    return NextResponse.json({
      ok: true,
      status: plan.fully ? 'refunded' : 'paid',
      refundId: refund.id,
      refundedCents: plan.newTotal,
      fully: plan.fully,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Refund failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
