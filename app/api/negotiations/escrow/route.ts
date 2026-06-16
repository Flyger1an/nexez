import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import type { AgentNegotiation } from '../../../../lib/negotiations'

/**
 * Owner-side escrow actions (the BUYER funds the hold via /api/negotiations/pay).
 *
 * Owner-authenticated, gated on STRIPE_SECRET_KEY:
 *  - action 'approve' → unlock a high-value ('awaiting_approval') agreement so the
 *                       buyer's pay link activates (settlement_state -> 'approved').
 *  - action 'capture' → capture a held (manual) authorization → status 'complete'.
 *  - action 'cancel'  → release the hold → status 'declined'.
 *
 * The buyer's funds live on the owner's connected account, so capture/cancel target it.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'negotiation-escrow', 20, 60_000)
  if (limited) return limited

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json(
      { error: 'Escrow is not available yet. Enable Stripe payments to use manual-capture holds.' },
      { status: 412 },
    )
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { negotiationId?: string; action?: 'approve' | 'capture' | 'cancel' | 'refund' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { negotiationId, action } = body
  if (!negotiationId || !action) {
    return NextResponse.json({ error: 'negotiationId and action are required.' }, { status: 400 })
  }

  // Load the negotiation — RLS ensures the caller can only read their own.
  const { data: negotiation, error } = await supabase
    .from('agent_negotiations')
    .select('*')
    .eq('id', negotiationId)
    .eq('owner_id', user.id)
    .maybeSingle<AgentNegotiation>()

  if (error || !negotiation) {
    return NextResponse.json({ error: 'Negotiation not found.' }, { status: 404 })
  }

  // Approve a high-value agreement so the buyer can pay (no Stripe call needed).
  if (action === 'approve') {
    if (negotiation.status !== 'agreement_proposed' || negotiation.settlement_state !== 'awaiting_approval') {
      return NextResponse.json({ error: 'Nothing to approve for this negotiation.' }, { status: 409 })
    }
    const { error: approveErr } = await supabase
      .from('agent_negotiations')
      .update({ settlement_state: 'approved', updated_at: new Date().toISOString() })
      .eq('id', negotiation.id)
      .eq('owner_id', user.id)
    if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, settlementState: 'approved' })
  }

  const stripe = new Stripe(secret)

  // The buyer's hold lives on the owner's connected account (if connected), so target it.
  const { data: billing } = await supabase
    .from('billing_subscriptions')
    .select('stripe_connect_account_id')
    .eq('owner_id', user.id)
    .maybeSingle<{ stripe_connect_account_id: string | null }>()
  const stripeAccount = billing?.stripe_connect_account_id || undefined

  try {
    if (action === 'capture') {
      if (negotiation.status !== 'held' || !negotiation.stripe_payment_intent_id) {
        return NextResponse.json({ error: 'No held authorization to capture.' }, { status: 409 })
      }
      await stripe.paymentIntents.capture(
        negotiation.stripe_payment_intent_id,
        {},
        { ...(stripeAccount ? { stripeAccount } : {}), idempotencyKey: `capture-${negotiation.id}` },
      )
      await supabase
        .from('agent_negotiations')
        .update({ status: 'complete', updated_at: new Date().toISOString() })
        .eq('id', negotiation.id)
        .eq('owner_id', user.id)
      return NextResponse.json({ ok: true, action, status: 'complete' })
    }

    if (action === 'cancel') {
      // Only a not-yet-captured deal can be cancelled. A 'complete' (captured) or
      // terminal negotiation must not be flipped to 'declined' — use refund for a
      // completed payment. (The money-safety trigger doesn't guard this backward move.)
      if (!['negotiation', 'agreement_proposed', 'held'].includes(negotiation.status)) {
        return NextResponse.json(
          { error: 'This agreement can no longer be cancelled (it is already captured or closed). Refund a completed payment instead.' },
          { status: 409 },
        )
      }
      if (negotiation.stripe_payment_intent_id) {
        await stripe.paymentIntents
          .cancel(negotiation.stripe_payment_intent_id, {}, stripeAccount ? { stripeAccount } : undefined)
          .catch(() => {})
      }
      await supabase
        .from('agent_negotiations')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', negotiation.id)
        .eq('owner_id', user.id)
      return NextResponse.json({ ok: true, action, status: 'declined' })
    }

    if (action === 'refund') {
      // Refund a captured payment. The charge.refunded webhook also flips status,
      // but doing it here gives the owner immediate feedback (idempotency-keyed so
      // the webhook + this call can't double-refund).
      if (negotiation.status !== 'complete' || !negotiation.stripe_payment_intent_id) {
        return NextResponse.json({ error: 'Only a completed payment can be refunded.' }, { status: 409 })
      }
      // Full refund only. (In-app PARTIAL refunds need a cumulative-refunded ledger to
      // be safe; tracked as a follow-up. Out-of-band partials from Stripe are still
      // handled by the charge.refunded webhook, which keeps the deal open on a partial.)
      const refund = await stripe.refunds.create(
        {
          payment_intent: negotiation.stripe_payment_intent_id,
          // Give Nexez's commission BACK on a refund — the charge took an
          // application_fee to the platform, so without this the seller would eat
          // the full refund while Nexez kept its cut. Connected-account refund.
          refund_application_fee: true,
        },
        { ...(stripeAccount ? { stripeAccount } : {}), idempotencyKey: `refund-${negotiation.id}` },
      )
      await supabase
        .from('agent_negotiations')
        .update({
          status: 'refunded',
          updated_at: new Date().toISOString(),
          metadata: {
            ...((negotiation.metadata as Record<string, unknown>) || {}),
            refund: { id: refund.id, amount_cents: refund.amount ?? null, source: 'owner_action', at: new Date().toISOString() },
          },
        })
        .eq('id', negotiation.id)
        .eq('owner_id', user.id)
      return NextResponse.json({ ok: true, action, status: 'refunded', refundId: refund.id })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Escrow action failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
