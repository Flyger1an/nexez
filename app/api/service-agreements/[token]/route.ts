import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { agreementStatusFromSubscription, validAgreementAccessToken } from '../../../../lib/server/service-agreement'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ token: string }> }
type BuyerAction = { action?: 'cancel' | 'resume' }

type AgreementRecord = {
  id: string
  owner_id: string
  page_id: string | null
  slug: string | null
  offer_key: string
  offer_name: string
  status: string
  contract_snapshot: Record<string, unknown>
  amount_per_period_cents: number
  currency: string
  stripe_connect_account_id: string
  stripe_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  started_at: string | null
  canceled_at: string | null
  created_at: string
  buyer_reference: string | null
}

async function agreementByToken(token: string): Promise<AgreementRecord | null> {
  if (!hasSupabaseAdminEnv()) return null
  const hash = validAgreementAccessToken(token)
  if (!hash) return null
  const { data } = await createAdminClient()
    .from('service_agreements')
    .select('id, owner_id, page_id, slug, offer_key, offer_name, status, contract_snapshot, amount_per_period_cents, currency, stripe_connect_account_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, started_at, canceled_at, created_at, buyer_reference')
    .eq('access_token_sha256', hash)
    .maybeSingle<AgreementRecord>()
  return data ?? null
}

async function publicAgreement(record: AgreementRecord) {
  const { data: page } = record.page_id
    ? await createAdminClient().from('pages').select('name').eq('id', record.page_id).maybeSingle<{ name: string | null }>()
    : { data: null }
  const { data: occurrences } = await createAdminClient()
    .from('checkout_orders')
    .select('id, status, amount_cents, currency, stripe_invoice_id, service_period_start, service_period_end, created_at')
    .eq('service_agreement_id', record.id)
    .order('service_period_start', { ascending: false })
    .limit(50)

  return {
    id: record.id,
    sellerName: page?.name ?? null,
    slug: record.slug,
    offerKey: record.offer_key,
    offerName: record.offer_name,
    status: record.status,
    contract: record.contract_snapshot,
    amountPerPeriod: record.amount_per_period_cents,
    currency: record.currency,
    currentPeriodStart: record.current_period_start,
    currentPeriodEnd: record.current_period_end,
    cancelAtPeriodEnd: record.cancel_at_period_end,
    startedAt: record.started_at,
    canceledAt: record.canceled_at,
    createdAt: record.created_at,
    buyerReference: record.buyer_reference,
    pauseSupported: false,
    occurrences: (occurrences ?? []).map((order: any) => ({
      id: order.id,
      status: order.status,
      amountCents: order.amount_cents,
      currency: order.currency,
      invoiceId: order.stripe_invoice_id,
      servicePeriodStart: order.service_period_start,
      servicePeriodEnd: order.service_period_end,
      paidAt: order.created_at,
    })),
  }
}

export async function GET(request: Request, context: RouteContext) {
  const limited = await enforceRateLimit(request, 'service-agreement-read', 60, 60_000, { failClosed: true })
  if (limited) return limited
  const { token } = await context.params
  const agreement = await agreementByToken(token)
  if (!agreement) return NextResponse.json({ error: 'Service agreement not found.' }, { status: 404 })
  return NextResponse.json(await publicAgreement(agreement))
}

export async function POST(request: Request, context: RouteContext) {
  const limited = await enforceRateLimit(request, 'service-agreement-action', 10, 60_000, { failClosed: true })
  if (limited) return limited
  const { token } = await context.params
  const agreement = await agreementByToken(token)
  if (!agreement) return NextResponse.json({ error: 'Service agreement not found.' }, { status: 404 })
  if (!agreement.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'This agreement has not started a paid subscription yet.', code: 'agreement_not_active' },
      { status: 409 },
    )
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 })
  }

  let input: BuyerAction = {}
  try {
    input = await request.json() as BuyerAction
  } catch {
    // handled below
  }
  if (input.action !== 'cancel' && input.action !== 'resume') {
    return NextResponse.json({ error: 'Action must be cancel or resume.' }, { status: 400 })
  }
  if (agreement.status === 'canceled') {
    return input.action === 'cancel'
      ? NextResponse.json(await publicAgreement(agreement))
      : NextResponse.json({ error: 'A fully canceled agreement cannot be resumed.', code: 'agreement_canceled' }, { status: 409 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  try {
    const subscription = await stripe.subscriptions.update(
      agreement.stripe_subscription_id,
      { cancel_at_period_end: input.action === 'cancel' },
      { stripeAccount: agreement.stripe_connect_account_id },
    )
    const state = agreementStatusFromSubscription(subscription)
    const { error } = await createAdminClient()
      .from('service_agreements')
      .update({
        status: agreement.started_at ? state.status : state.status === 'past_due' ? 'past_due' : 'pending',
        cancel_at_period_end: state.cancelAtPeriodEnd,
        current_period_start: state.periodStart,
        current_period_end: state.periodEnd,
        ...(state.canceledAt ? { canceled_at: state.canceledAt } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agreement.id)
      .eq('stripe_subscription_id', agreement.stripe_subscription_id)
    if (error) {
      return NextResponse.json(
        { error: 'Stripe accepted the change but Nexez could not persist the new agreement state. The webhook will reconcile it.', code: 'agreement_sync_pending' },
        { status: 202 },
      )
    }
    const refreshed = await agreementByToken(token)
    return NextResponse.json(refreshed ? await publicAgreement(refreshed) : { ok: true, status: state.status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update the recurring agreement.', code: 'stripe_subscription_error' },
      { status: 502 },
    )
  }
}
