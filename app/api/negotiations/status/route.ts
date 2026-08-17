import { NextResponse } from 'next/server'
import { getNegotiationStatusLabel, type NegotiationStatus, NEGOTIATION_STATUSES } from '../../../../lib/negotiations'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { isPayable, type SettlementState } from '../../../../lib/settlement'
import { sanitizeAgentDecision } from '../../../../lib/negotiation-sanitize'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { hashBearerToken } from '../../../../lib/server/bearer-token'

/**
 * Agent-facing negotiation status check (now also the async-decision poll target).
 *
 * GET /api/negotiations/status?id=<uuid>&token=<status_token>
 *
 * The token is generated at proposal creation and returned exactly once in the
 * POST /api/negotiations response - it is the credential. Rows are owner-only
 * under RLS, so the lookup uses the service-role client scoped to id+token.
 * Any mismatch (wrong id, wrong token, deleted row) is a constant 404 so the
 * endpoint leaks nothing about which negotiations exist.
 *
 * Burst 3a: the LLM decision is asynchronous, so this endpoint surfaces it.
 * `decisionPending` is true while the LLM is still running; once false the
 * sanitized `decision` (action/counter/reasoning/clarification/scheduling - owner
 * `internalNotes` stripped) is returned and `decisionSeq` increments per turn so
 * a polling agent can detect a new decision.
 */
export async function GET(request: Request) {
  // Polling needs headroom - keep the per-IP allowance generous here.
  const limited = await enforceRateLimit(request, 'negotiation-status', 60, 60_000)
  if (limited) return limited

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Status checks are not configured on this deployment.' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const id = (searchParams.get('id') || '').trim()
  const token = (searchParams.get('token') || '').trim()

  if (!id || !token) {
    return NextResponse.json({ error: 'id and token query params are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_negotiations')
    .select('id, status, offer_name, updated_at, amount_cents, settlement_state, decision_pending, decision_seq, metadata')
    .eq('id', id)
    .eq('status_token_sha256', hashBearerToken(token) ?? '')
    .maybeSingle<{
      id: string
      status: NegotiationStatus
      offer_name: string
      updated_at: string | null
      amount_cents: number | null
      settlement_state: SettlementState | null
      decision_pending: boolean | null
      decision_seq: number | null
      metadata: { last_decision?: unknown } | null
    }>()

  if (error || !data || !NEGOTIATION_STATUSES.includes(data.status)) {
    return NextResponse.json({ error: 'Negotiation not found.' }, { status: 404 })
  }

  // The buyer may pay when an agreement is reached, has a valid amount, and the
  // settlement is autonomous or owner-approved (else it's awaiting seller approval).
  const payable =
    data.status === 'agreement_proposed' &&
    !!data.amount_cents &&
    data.amount_cents >= 50 &&
    isPayable(data.settlement_state)

  const decisionPending = Boolean(data.decision_pending)
  // The decision is owner-private until sanitized - strip internalNotes before it
  // ever reaches the agent. Null while a decision is still being produced.
  const decision = decisionPending ? null : sanitizeAgentDecision(data.metadata?.last_decision as Record<string, any> | null | undefined) ?? null

  return NextResponse.json(
    {
      id: data.id,
      status: data.status,
      statusLabel: getNegotiationStatusLabel(data.status),
      offer: data.offer_name,
      amountCents: data.amount_cents ?? null,
      settlementState: data.settlement_state ?? null,
      payable,
      decisionPending,
      decisionSeq: data.decision_seq ?? 0,
      decision,
      updatedAt: data.updated_at,
      next: getAgentNextStep(data.status, { settlement: data.settlement_state, payable, decisionPending, decision }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function getAgentNextStep(
  status: NegotiationStatus,
  ctx: { settlement?: SettlementState | null; payable?: boolean; decisionPending?: boolean; decision?: any },
): string {
  switch (status) {
    case 'negotiation':
      if (ctx.decisionPending) {
        return 'The seller is responding - your proposal is being evaluated. Poll again in a few seconds.'
      }
      if (ctx.decision?.action === 'counter') {
        const price = ctx.decision.counter?.priceCents != null ? ` ($${(ctx.decision.counter.priceCents / 100).toFixed(2)})` : ''
        return `The seller countered${price}. Accept it or submit a follow-up (reuse your id + token to continue the thread).`
      }
      if (ctx.decision?.action === 'clarify') {
        return 'The seller needs clarification before deciding. Reply with a follow-up (reuse your id + token).'
      }
      if (ctx.decision?.action === 'reject') {
        return 'The seller declined this proposal. You may submit a revised offer.'
      }
      return 'Under review by the seller. Check back shortly.'
    case 'agreement_proposed':
      if (ctx.payable) {
        return 'Agreement reached - POST /api/negotiations/pay with your id+token to fund and secure it.'
      }
      if (ctx.settlement === 'awaiting_approval') {
        return 'Agreement reached - awaiting seller approval before payment. Check back shortly.'
      }
      return 'Agreement proposed - the seller will finalize payment or scheduling next.'
    case 'held':
      return 'Funds are held in escrow pending completion.'
    case 'complete':
      return 'Complete. No further action needed.'
    case 'declined':
      return 'The seller declined this proposal. You may submit a revised offer.'
    case 'expired':
      return 'This proposal expired. Submit a new one if still interested.'
    case 'refunded':
      return 'This payment was refunded. Submit a new proposal if still interested.'
    case 'disputed':
      return 'This payment is under dispute. The seller has been notified; no action needed.'
  }
}
