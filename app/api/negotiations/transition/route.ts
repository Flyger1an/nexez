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
  const limited = enforceRateLimit(request, 'negotiation-transition', 30, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { negotiationId?: string; to?: NegotiationStatus }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { negotiationId, to } = body
  if (!negotiationId || !to || !NEGOTIATION_STATUSES.includes(to)) {
    return NextResponse.json({ error: 'negotiationId and a valid target status are required.' }, { status: 400 })
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
  if (!canTransitionNegotiation(negotiation.status, to, { escrowAvailable })) {
    return NextResponse.json(
      { error: `Illegal transition: ${negotiation.status} → ${to}.` },
      { status: 409 },
    )
  }

  // A Stripe-backed hold must be captured/released via /escrow, not completed here.
  if (to === 'complete' && negotiation.stripe_payment_intent_id && negotiation.status === 'held') {
    return NextResponse.json({ error: 'Capture the held funds via escrow to complete.' }, { status: 409 })
  }

  const { error: updateErr } = await supabase
    .from('agent_negotiations')
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq('id', negotiation.id)
    .eq('owner_id', user.id)
  if (updateErr) {
    // The money-safety trigger raises here if a guarded invariant is violated.
    return NextResponse.json({ error: updateErr.message }, { status: 409 })
  }
  return NextResponse.json({ ok: true, status: to })
}
