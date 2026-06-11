import { NextResponse } from 'next/server'
import { getNegotiationStatusLabel, type NegotiationStatus, NEGOTIATION_STATUSES } from '../../../../lib/negotiations'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { isPayable, type SettlementState } from '../../../../lib/settlement'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

/**
 * Smart Rules Phase 1: agent-facing negotiation status check.
 *
 * GET /api/negotiations/status?id=<uuid>&token=<status_token>
 *
 * The token is generated at proposal creation and returned exactly once in the
 * POST /api/negotiations response — it is the credential. Rows are owner-only
 * under RLS, so the lookup uses the service-role client scoped to id+token.
 * Any mismatch (wrong id, wrong token, deleted row) is a constant 404 so the
 * endpoint leaks nothing about which negotiations exist.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, 'negotiation-status', 60, 60_000)
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
    .select('id, status, offer_name, updated_at, amount_cents, settlement_state')
    .eq('id', id)
    .eq('status_token', token)
    .maybeSingle<{
      id: string
      status: NegotiationStatus
      offer_name: string
      updated_at: string | null
      amount_cents: number | null
      settlement_state: SettlementState | null
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

  return NextResponse.json(
    {
      id: data.id,
      status: data.status,
      statusLabel: getNegotiationStatusLabel(data.status),
      offer: data.offer_name,
      amountCents: data.amount_cents ?? null,
      settlementState: data.settlement_state ?? null,
      payable,
      updatedAt: data.updated_at,
      next: getAgentNextStep(data.status, data.settlement_state, payable),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function getAgentNextStep(status: NegotiationStatus, settlement?: SettlementState | null, payable?: boolean): string {
  switch (status) {
    case 'negotiation':
      return 'Under review by the seller. Check back later.'
    case 'agreement_proposed':
      if (payable) {
        return 'Agreement reached — POST /api/negotiations/pay with your id+token to fund and secure it.'
      }
      if (settlement === 'awaiting_approval') {
        return 'Agreement reached — awaiting seller approval before payment. Check back shortly.'
      }
      return 'Agreement proposed — the seller will finalize payment or scheduling next.'
    case 'held':
      return 'Funds are held in escrow pending completion.'
    case 'complete':
      return 'Complete. No further action needed.'
    case 'declined':
      return 'The seller declined this proposal. You may submit a revised offer.'
    case 'expired':
      return 'This proposal expired. Submit a new one if still interested.'
  }
}
