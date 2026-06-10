import { NextResponse } from 'next/server'
import { getNegotiationStatusLabel, type NegotiationStatus, NEGOTIATION_STATUSES } from '../../../../lib/negotiations'
import { enforceRateLimit } from '../../../../lib/rate-limit'
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
    .select('id, status, offer_name, updated_at')
    .eq('id', id)
    .eq('status_token', token)
    .maybeSingle<{ id: string; status: NegotiationStatus; offer_name: string; updated_at: string | null }>()

  if (error || !data || !NEGOTIATION_STATUSES.includes(data.status)) {
    return NextResponse.json({ error: 'Negotiation not found.' }, { status: 404 })
  }

  return NextResponse.json(
    {
      id: data.id,
      status: data.status,
      statusLabel: getNegotiationStatusLabel(data.status),
      offer: data.offer_name,
      updatedAt: data.updated_at,
      next: getAgentNextStep(data.status),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function getAgentNextStep(status: NegotiationStatus): string {
  switch (status) {
    case 'negotiation':
      return 'Under review by the seller. Check back later.'
    case 'agreement_proposed':
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
