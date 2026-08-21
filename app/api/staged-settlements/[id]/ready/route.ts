import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { canReadyStagedSettlementObligation, type StagedSettlementObligationStatus } from '../../../../../lib/staged-settlement-runtime'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { createClient } from '../../../../../utils/supabase/server'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  const limited = await enforceRateLimit(request, 'staged-settlement-ready', 30, 60_000, { failClosed: true })
  if (limited) return limited
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Staged settlement is unavailable.' }, { status: 503 })

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => ({})) as { stageId?: string }
  const stageId = body.stageId?.trim() || ''
  if (!stageId) return NextResponse.json({ error: 'stageId is required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: agreement } = await admin
    .from('staged_settlement_agreements')
    .select('id, owner_id, status')
    .eq('id', id)
    .maybeSingle<{ id: string; owner_id: string; status: string }>()
  if (!agreement || agreement.owner_id !== user.id) {
    return NextResponse.json({ error: 'Staged settlement agreement not found.' }, { status: 404 })
  }
  if (agreement.status === 'complete' || agreement.status === 'cancelled' || agreement.status === 'disputed') {
    return NextResponse.json(
      { error: `This agreement is ${agreement.status} and cannot ready another obligation.`, code: 'agreement_not_readyable' },
      { status: 409 },
    )
  }
  const { data: rawObligations, error: readError } = await admin
    .from('staged_settlement_obligations')
    .select('id, stage_id, stage_order, label, amount_cents, status')
    .eq('agreement_id', agreement.id)
    .order('stage_order', { ascending: true })
  if (readError) return NextResponse.json({ error: 'Could not read staged obligations.' }, { status: 500 })
  const obligations = (rawObligations ?? []) as Array<{
    id: string
    stage_id: string
    stage_order: number
    label: string
    amount_cents: number
    status: StagedSettlementObligationStatus
  }>
  const target = obligations.find((item) => item.stage_id === stageId)
  if (!target) return NextResponse.json({ error: 'Staged obligation not found.' }, { status: 404 })
  if (!canReadyStagedSettlementObligation({
    stageOrder: target.stage_order,
    obligations: obligations.map((item) => ({ stageOrder: item.stage_order, status: item.status })),
  })) {
    return NextResponse.json(
      { error: 'Only the next pending obligation may be readied after every predecessor is paid.', code: 'obligation_not_readyable' },
      { status: 409 },
    )
  }
  const { data: updated, error } = await admin
    .from('staged_settlement_obligations')
    .update({ status: 'ready_for_buyer_approval', updated_at: new Date().toISOString() })
    .eq('id', target.id)
    .eq('agreement_id', agreement.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error || !updated) {
    return NextResponse.json({ error: 'The obligation changed before it could be readied.', code: 'obligation_state_conflict' }, { status: 409 })
  }
  return NextResponse.json({
    ok: true,
    agreementId: agreement.id,
    currentObligation: {
      stageId: target.stage_id,
      order: target.stage_order,
      label: target.label,
      amountCents: target.amount_cents,
      status: 'ready_for_buyer_approval',
    },
  })
}
