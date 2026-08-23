import { NextResponse } from 'next/server'
import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  canTransitionNegotiation,
  type AgentNegotiation,
  type NegotiationStatus,
  isNegotiationExpansionAction,
  NEGOTIATION_STATUSES,
} from '../../../../lib/negotiations'
import {
  ownerDecisionRequestSchema,
  type OwnerNegotiationDecision,
} from '../../../../lib/contracts/negotiation'
import { classifySettlement, getAutoSettleCeilingCents, type SettlementState } from '../../../../lib/settlement'
import { getCheckoutOffer } from '../../../../lib/agent-page'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { notifyBuyerOfNegotiationDecision } from '../../../../lib/server/negotiation-notifications'
import { captureError } from '../../../../lib/observability'
import { minPlanForFeature } from '../../../../lib/billing'
import { ownerAllows } from '../../../../lib/server/plan'

type TransitionBody = {
  negotiationId?: string
  to?: NegotiationStatus
  decision?: unknown
  amountCents?: number
  ownerMessage?: unknown
}

/**
 * Owner-side negotiation control plane.
 *
 * Human decisions are persisted by one database transaction: message, status,
 * amount, settlement, decision sequence, pending lease, and buyer-visible latest
 * decision move together. Direct table writes are revoked by the Pass 1 migration.
 * Money-moving capture/cancel/refund operations remain on /escrow.
 */
export async function POST(request: Request) {
  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const limited = await enforceRateLimit(request, 'negotiation-transition', 30, 60_000, {
    subject: user.id,
    failClosed: true,
  })
  if (limited) return limited

  let body: TransitionBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const negotiationId = typeof body.negotiationId === 'string' ? body.negotiationId.trim() : ''
  if (!negotiationId) {
    return NextResponse.json({ error: 'negotiationId is required.' }, { status: 400 })
  }
  if (body.ownerMessage != null) {
    return NextResponse.json(
      { error: 'ownerMessage is no longer accepted. Send the canonical decision envelope with integer amountCents.' },
      { status: 400 },
    )
  }

  const actionCount = Number(body.decision != null) + Number(body.to != null) + Number(body.amountCents != null)
  if (actionCount !== 1) {
    return NextResponse.json(
      { error: 'Send exactly one action: decision, to, or amountCents.' },
      { status: 400 },
    )
  }
  if (body.to && !NEGOTIATION_STATUSES.includes(body.to)) {
    return NextResponse.json({ error: 'Invalid target status.' }, { status: 400 })
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

  // Production always uses the service-role client. The authenticated fallback
  // is useful only for isolated tests/pre-migration local environments; database
  // grants reject it after the integrity migration.
  const writer = hasSupabaseAdminEnv() ? createAdminClient() : supabase
  const entitlementOwnerId = negotiation.owner_id

  async function expansionGate(): Promise<NextResponse | null> {
    // The persisted negotiation owner is the canonical page owner for this
    // lifecycle and its economics. Never substitute the viewer or a mutable
    // current page owner: a page transfer must not change an in-flight deal's
    // entitlement authority.
    const allowed = entitlementOwnerId
      ? await ownerAllows(writer, entitlementOwnerId, 'negotiation')
      : false
    if (allowed) return null

    const required = minPlanForFeature('negotiation')
    return NextResponse.json(
      {
        error: `Continuing or revising a negotiation requires the ${required.name} plan. You can still accept, reject, pause, settle, cancel, or refund an existing deal.`,
        code: 'negotiation_expansion_requires_plan',
        upgrade: required.id,
      },
      { status: 402 },
    )
  }

  if (body.amountCents != null) {
    if (!Number.isInteger(body.amountCents) || body.amountCents < 50) {
      return NextResponse.json({ error: 'amountCents must be an integer of at least 50.' }, { status: 400 })
    }
    if (!['negotiation', 'agreement_proposed'].includes(negotiation.status) || negotiation.stripe_payment_intent_id) {
      return NextResponse.json({ error: `Cannot change amount in status '${negotiation.status}'.` }, { status: 409 })
    }
    // An exact no-op is safe after downgrade and avoids turning a harmless retry
    // into an upgrade error. Every material standalone amount change expands the
    // commercial terms and is gated against the persisted owner.
    if (body.amountCents === negotiation.amount_cents) {
      return NextResponse.json({ ok: true, status: negotiation.status, amountCents: body.amountCents })
    }
    const gate = await expansionGate()
    if (gate) return gate

    const { error: updateError } = await writer
      .from('agent_negotiations')
      .update({ amount_cents: body.amountCents, updated_at: new Date().toISOString() })
      .eq('id', negotiation.id)
      .eq('owner_id', user.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 409 })
    return NextResponse.json({ ok: true, status: negotiation.status, amountCents: body.amountCents })
  }

  // Preserve the explicit offline completion control, but never let a configured
  // payment agreement skip buyer funding. Other status controls become canonical
  // owner decisions so the buyer-visible decision state advances too.
  if (body.to === 'complete') {
    if (
      negotiation.status !== 'agreement_proposed' ||
      negotiation.escrow_mode !== 'not_configured' ||
      negotiation.stripe_payment_intent_id
    ) {
      return NextResponse.json(
        { error: 'Only an explicitly offline, unfunded agreement can be marked complete here.' },
        { status: 409 },
      )
    }
    const { error: updateError } = await writer
      .from('agent_negotiations')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', negotiation.id)
      .eq('owner_id', user.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 409 })
    return NextResponse.json({ ok: true, status: 'complete', settlement: 'offline' })
  }

  let decision: OwnerNegotiationDecision
  if (body.decision != null) {
    const parsed = ownerDecisionRequestSchema.safeParse({ negotiationId, decision: body.decision })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid decision payload.', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    decision = parsed.data.decision
  } else {
    const mapped = transitionAsDecision(negotiation, body.to)
    if (!mapped) {
      return NextResponse.json(
        { error: 'This transition requires a canonical owner decision.' },
        { status: 400 },
      )
    }
    decision = mapped
  }

  if (negotiation.status === 'paused' && !['resume', 'reject'].includes(decision.action)) {
    return NextResponse.json(
      { error: 'A paused negotiation can only be resumed or rejected.' },
      { status: 409 },
    )
  }
  if (negotiation.status !== 'paused' && decision.action === 'resume') {
    return NextResponse.json(
      { error: 'Only a paused negotiation can be resumed.' },
      { status: 409 },
    )
  }

  const escrowAvailable = negotiation.escrow_mode !== 'not_configured'
  const targetStatus = decisionTargetStatus(decision, negotiation.status)
  if (
    targetStatus !== negotiation.status &&
    !canTransitionNegotiation(negotiation.status, targetStatus, { escrowAvailable })
  ) {
    return NextResponse.json(
      { error: `Illegal transition: ${negotiation.status} → ${targetStatus}.` },
      { status: 409 },
    )
  }

  const amountCents = decision.action === 'counter'
    ? decision.counter.priceCents
    : decision.action === 'accept'
      ? decision.amountCents ?? negotiation.amount_cents
      : null

  if (decision.action === 'accept' && (!amountCents || amountCents < 50)) {
    return NextResponse.json(
      { error: 'Accept requires amountCents of at least 50, or a previously saved agreed amount.' },
      { status: 400 },
    )
  }

  // Accept/reject/pause remain available after downgrade so a seller can close
  // an in-flight negotiation. An accept that silently rewrites a previously
  // saved amount is still a commercial expansion and must not bypass the gate.
  // Run this only after transition/amount validation so an invalid action keeps
  // its canonical error rather than being misreported as a plan restriction.
  const changesSavedAmount = decision.action === 'accept'
    && decision.amountCents != null
    && negotiation.amount_cents != null
    && decision.amountCents !== negotiation.amount_cents
  if (isNegotiationExpansionAction(decision.action) || changesSavedAmount) {
    const gate = await expansionGate()
    if (gate) return gate
  }

  let settlementState: SettlementState | null = null
  if (decision.action === 'accept' && amountCents) {
    const { data: page } = await supabase
      .from('pages')
      .select('services, products')
      .eq('id', negotiation.page_id)
      .eq('owner_id', user.id)
      .maybeSingle<any>()
    const offer = page ? getCheckoutOffer(page, negotiation.offer_key) : null
    settlementState = classifySettlement(amountCents, getAutoSettleCeilingCents(offer))
  }

  const updatedAt = new Date().toISOString()
  const { data, error: decisionError } = await writer.rpc('nz_apply_owner_decision', {
    p_negotiation_id: negotiation.id,
    p_owner_id: user.id,
    p_expected_seq: negotiation.decision_seq ?? 0,
    p_decision: decision,
    p_amount_cents: amountCents,
    p_settlement_state: settlementState,
    p_updated_at: updatedAt,
  })
  if (decisionError) {
    const status = decisionError.code === 'P0002' ? 404 : 409
    return NextResponse.json({ error: decisionError.message }, { status })
  }

  try {
    await notifyBuyerOfNegotiationDecision(negotiation, decision.action)
  } catch (notificationError) {
    captureError(notificationError instanceof Error ? notificationError : new Error(String(notificationError)), {
      negotiationId: negotiation.id,
      phase: 'notifyOwnerDecision',
    })
  }

  const persisted = (data as { negotiation?: AgentNegotiation } | null)?.negotiation
  return NextResponse.json({
    ok: true,
    status: persisted?.status ?? targetStatus,
    decisionSeq: persisted?.decision_seq ?? (negotiation.decision_seq ?? 0) + 1,
    amountCents: persisted?.amount_cents ?? amountCents,
    settlementState: persisted?.settlement_state ?? settlementState,
  })
}

function transitionAsDecision(
  negotiation: AgentNegotiation,
  to: NegotiationStatus | undefined,
): OwnerNegotiationDecision | null {
  if (to === 'declined') return { action: 'reject', reasoning: 'Declined by the seller.' }
  if (to === 'paused') return { action: 'pause', reasoning: 'Paused by the seller.' }
  if (to === 'negotiation' && negotiation.status === 'paused') {
    return { action: 'resume', reasoning: 'Resumed by the seller.' }
  }
  return null
}

function decisionTargetStatus(
  decision: OwnerNegotiationDecision,
  current: NegotiationStatus,
): NegotiationStatus {
  if (decision.action === 'accept') return 'agreement_proposed'
  if (decision.action === 'reject') return 'declined'
  if (decision.action === 'pause') return 'paused'
  if (decision.action === 'resume' || decision.action === 'counter' || decision.action === 'clarify') return 'negotiation'
  return current
}
