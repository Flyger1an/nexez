import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { validStagedSettlementAccessToken } from '../../../../lib/server/staged-settlement-agreement'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const runtime = 'nodejs'
type Context = { params: Promise<{ token: string }> }

export async function GET(request: Request, context: Context) {
  const limited = await enforceRateLimit(request, 'staged-settlement-read', 60, 60_000, { failClosed: true })
  if (limited) return limited
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Staged settlement is unavailable.' }, { status: 503 })
  const { token } = await context.params
  const hash = validStagedSettlementAccessToken(token)
  if (!hash) return NextResponse.json({ error: 'Staged settlement agreement not found.' }, { status: 404 })
  const admin = createAdminClient()
  const { data: agreement } = await admin
    .from('staged_settlement_agreements')
    .select('id, page_id, slug, offer_key, offer_name, status, total_amount_cents, currency, created_at, completed_at, buyer_reference')
    .eq('access_token_sha256', hash)
    .maybeSingle<any>()
  if (!agreement) return NextResponse.json({ error: 'Staged settlement agreement not found.' }, { status: 404 })
  const [{ data: obligations }, { data: page }] = await Promise.all([
    admin
      .from('staged_settlement_obligations')
      .select('stage_id, stage_order, label, kind, allocation_bps, amount_cents, status, paid_at, refunded_at, disputed_at')
      .eq('agreement_id', agreement.id)
      .order('stage_order', { ascending: true }),
    agreement.page_id
      ? admin.from('pages').select('name').eq('id', agreement.page_id).maybeSingle<{ name: string | null }>()
      : Promise.resolve({ data: null }),
  ])
  const publicObligations = ((obligations ?? []) as Array<any>).map((item) => ({
    stageId: item.stage_id,
    order: item.stage_order,
    label: item.label,
    kind: item.kind,
    allocationBps: item.allocation_bps,
    amountCents: item.amount_cents,
    status: item.status,
    paidAt: item.paid_at,
    refundedAt: item.refunded_at,
    disputedAt: item.disputed_at,
  }))
  const paidAmountCents = publicObligations
    .filter((item) => item.status === 'paid')
    .reduce((total, item) => total + item.amountCents, 0)
  const current = publicObligations.find((item) =>
    item.status === 'ready_for_buyer_approval' || item.status === 'payment_pending') ?? null
  return NextResponse.json({
    id: agreement.id,
    sellerName: page?.name ?? null,
    slug: agreement.slug,
    offerKey: agreement.offer_key,
    offerName: agreement.offer_name,
    status: agreement.status,
    totalAmountCents: agreement.total_amount_cents,
    paidAmountCents,
    remainingAmountCents: agreement.total_amount_cents - paidAmountCents,
    currency: agreement.currency,
    buyerReference: agreement.buyer_reference,
    currentObligation: current,
    obligations: publicObligations,
    nextAction: current?.status === 'ready_for_buyer_approval'
      ? { type: 'approve_and_pay', url: `/api/staged-settlements/${token}/checkout` }
      : null,
    createdAt: agreement.created_at,
    completedAt: agreement.completed_at,
  })
}
