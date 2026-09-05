import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { executeRefund, validRefundOperationId } from '../../../../lib/server/refund-operation'
import type { AgentNegotiation } from '../../../../lib/negotiations'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

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
  const limited = await enforceRateLimit(request, 'negotiation-escrow', 20, 60_000, { failClosed: true })
  if (limited) return limited

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json(
      { error: 'Escrow is not available yet. Enable Stripe payments to use manual-capture holds.' },
      { status: 412 },
    )
  }

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const writer = hasSupabaseAdminEnv() ? createAdminClient() : supabase

  let body: { negotiationId?: string; action?: 'approve' | 'capture' | 'cancel' | 'refund'; amount?: number; operationId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { negotiationId, action } = body
  if (!negotiationId || !action) {
    return NextResponse.json({ error: 'negotiationId and action are required.' }, { status: 400 })
  }
  // Optional partial-refund amount, in MAJOR units of the deal currency (omit = full remainder).
  const hasAmount = body.amount != null
  if (action === 'refund' && hasAmount && (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0)) {
    return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 })
  }

  // Load the negotiation - RLS ensures the caller can only read their own.
  const { data: negotiation, error } = await supabase
    .from('agent_negotiations')
    .select('*')
    .eq('id', negotiationId)
    .eq('owner_id', user.id)
    .maybeSingle<AgentNegotiation>()

  if (error || !negotiation) {
    return NextResponse.json({ error: 'Negotiation not found.' }, { status: 404 })
  }

  if (action === 'refund') {
    if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Refund persistence is unavailable.' }, { status: 503 })
    if (!validRefundOperationId(body.operationId)) {
      return NextResponse.json({ error: 'A stable refund operationId (UUID v4) is required.' }, { status: 400 })
    }
    return executeRefund({
      operationId: body.operationId, ownerId: user.id, kind: 'negotiation', targetId: negotiation.id,
      currency: negotiation.currency || 'usd', amount: body.amount,
    })
  }

  // Approve a high-value agreement so the buyer can pay (no Stripe call needed).
  if (action === 'approve') {
    if (negotiation.status !== 'agreement_proposed' || negotiation.settlement_state !== 'awaiting_approval') {
      return NextResponse.json({ error: 'Nothing to approve for this negotiation.' }, { status: 409 })
    }
    const { error: approveErr } = await writer
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
      const { error: captureUpdateError } = await writer
        .from('agent_negotiations')
        .update({ status: 'complete', updated_at: new Date().toISOString() })
        .eq('id', negotiation.id)
        .eq('owner_id', user.id)
      if (captureUpdateError) throw captureUpdateError
      return NextResponse.json({ ok: true, action, status: 'complete' })
    }

    if (action === 'cancel') {
      // Only a not-yet-captured deal can be cancelled. A 'complete' (captured) or
      // terminal negotiation must not be flipped to 'declined' - use refund for a
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
      const { error: cancelUpdateError } = await writer
        .from('agent_negotiations')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', negotiation.id)
        .eq('owner_id', user.id)
      if (cancelUpdateError) throw cancelUpdateError
      return NextResponse.json({ ok: true, action, status: 'declined' })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Escrow action failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
