import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  canTransitionNegotiation,
  type AgentNegotiation,
  type NegotiationStatus,
  NEGOTIATION_STATUSES,
} from '../../../../lib/negotiations'

type OwnerMessage = {
  action: 'accept' | 'counter' | 'reject' | 'clarify'
  reasoning: string
  proposed_price?: number
  proposed_date?: string
  scope_notes?: string
  questions?: string[]
  internal_notes?: string
}

/**
 * Owner-side non-payment status transitions, validated server-side.
 *
 * Replaces the inbox's direct client-side status writes so illegal transitions are
 * rejected by the server (and the DB money-safety trigger), not just hidden in the UI.
 * Money-moving steps stay on dedicated routes:
 *  - 'held'    is set only by the Stripe webhook (buyer funded) — never here.
 *  - 'complete'/'declined' on a Stripe-backed hold go through /escrow capture|cancel.
 * This route handles: propose agreement, decline, reopen, and offline complete.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'negotiation-transition', 30, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: {
    negotiationId?: string
    to?: NegotiationStatus
    ownerMessage?: OwnerMessage
    amountCents?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { negotiationId, to, ownerMessage, amountCents } = body
  if (!negotiationId || (!to && !ownerMessage && amountCents == null)) {
    return NextResponse.json({ error: 'negotiationId and at least one action (to, ownerMessage, or amountCents) are required.' }, { status: 400 })
  }
  if (to && !NEGOTIATION_STATUSES.includes(to)) {
    return NextResponse.json({ error: 'Invalid target status.' }, { status: 400 })
  }

  // 'held' is buyer-funded via the Stripe webhook only.
  if (to === 'held') {
    return NextResponse.json({ error: 'Escrow holds are funded by the buyer, not set directly.' }, { status: 409 })
  }

  const { data: negotiation, error } = await supabase
    .from('agent_negotiations')
    .select('*')
    .eq('id', negotiationId)
    .eq('owner_id', user.id)
    .maybeSingle<AgentNegotiation>()
  if (error || !negotiation) {
    return NextResponse.json({ error: 'Negotiation not found.' }, { status: 404 })
  }

  const escrowAvailable = negotiation.escrow_mode !== 'not_configured'
  if (to && !canTransitionNegotiation(negotiation.status, to, { escrowAvailable })) {
    return NextResponse.json(
      { error: `Illegal transition: ${negotiation.status} → ${to}.` },
      { status: 409 },
    )
  }

  // A Stripe-backed hold must be captured/released via /escrow, not completed here.
  if (to === 'complete' && negotiation.stripe_payment_intent_id && negotiation.status === 'held') {
    return NextResponse.json({ error: 'Capture the held funds via escrow to complete.' }, { status: 409 })
  }

  let finalStatus = to

  // Only allow amount updates on states where it makes sense (proposed or before funding).
  // This centralizes the previous direct client writes. Note: Authenticated owners can still
  // mutate via direct Supabase (RLS allows it for flexibility); full lock would require
  // tighter policies or additional triggers. We rely on app-layer guards + DB money-safety
  // trigger as defense-in-depth. Amount changes after PI attached are still rejected by trigger.
  if (amountCents != null) {
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return NextResponse.json({ error: 'Invalid amount (minimum 50 cents).' }, { status: 400 })
    }
    const allowedAmountStates = ['negotiation', 'agreement_proposed']
    if (!allowedAmountStates.includes(negotiation.status)) {
      return NextResponse.json({ error: `Cannot change amount in status '${negotiation.status}'.` }, { status: 409 })
    }
    const { error: amtErr } = await supabase
      .from('agent_negotiations')
      .update({ amount_cents: amountCents, updated_at: new Date().toISOString() })
      .eq('id', negotiation.id)
      .eq('owner_id', user.id)
    if (amtErr) {
      return NextResponse.json({ error: amtErr.message }, { status: 409 })
    }
  }

  // Handle owner manual message + status mapping (replaces previous client direct writes)
  if (ownerMessage) {
    const content: any = {
      action: ownerMessage.action,
      reasoning: ownerMessage.reasoning,
    }
    if (ownerMessage.proposed_price != null) content.proposed_price = ownerMessage.proposed_price
    if (ownerMessage.proposed_date) content.proposed_date = ownerMessage.proposed_date
    if (ownerMessage.scope_notes) content.scope_notes = ownerMessage.scope_notes
    if (ownerMessage.questions?.length) content.questions = ownerMessage.questions
    if (ownerMessage.internal_notes) content.internal_notes = ownerMessage.internal_notes

    const { error: msgErr } = await supabase.from('negotiation_messages').insert({
      negotiation_id: negotiation.id,
      role: 'seller_owner',
      content,
    })
    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 409 })
    }

    // Map to status (server validated)
    if (ownerMessage.action === 'accept') finalStatus = 'agreement_proposed'
    else if (ownerMessage.action === 'reject') finalStatus = 'declined'
    else if (ownerMessage.action === 'counter') finalStatus = 'negotiation'
    // clarify keeps current status (or caller can pass explicit `to`)
  }

  if (finalStatus && finalStatus !== negotiation.status) {
    if (!canTransitionNegotiation(negotiation.status, finalStatus!, { escrowAvailable })) {
      return NextResponse.json(
        { error: `Illegal transition after owner action: ${negotiation.status} → ${finalStatus}.` },
        { status: 409 },
      )
    }

    const { error: updateErr } = await supabase
      .from('agent_negotiations')
      .update({ status: finalStatus, updated_at: new Date().toISOString() })
      .eq('id', negotiation.id)
      .eq('owner_id', user.id)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 409 })
    }
  }

  return NextResponse.json({ ok: true, status: finalStatus || negotiation.status })
}
