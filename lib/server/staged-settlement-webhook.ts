import 'server-only'
import { withStripeWebhookLease } from './stripe-webhook-lease'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { createAdminClient } from '../../utils/supabase/admin'
import { bearerTokenColumns, mintBearerToken } from './bearer-token'
import { STRIPE_STAGED_SETTLEMENT_KIND } from './staged-settlement-agreement'

type AgreementRow = {
  id: string
  owner_id: string
  page_id: string | null
  slug: string | null
  offer_key: string
  offer_name: string
  status: string
  contract_fingerprint: string
  currency: string
  stripe_connect_account_id: string
  commission_bps: number | null
  plan_id_at_purchase: string | null
  commission_source: string | null
  buyer_email: string | null
  buyer_name: string | null
  buyer_reference: string | null
  buyer_agent: string | null
}

type ObligationRow = {
  id: string
  agreement_id: string
  stage_id: string
  stage_order: number
  label: string
  amount_cents: number
  status: string
  approval_fingerprint: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  application_fee_cents: number | null
}

function eventAccount(event: Stripe.Event) {
  return (event as Stripe.Event & { account?: string }).account ?? null
}

export function isStagedSettlementStripeEvent(event: Stripe.Event) {
  if (event.type !== 'checkout.session.completed') return false
  return (event.data.object as Stripe.Checkout.Session).metadata?.nexez_kind === STRIPE_STAGED_SETTLEMENT_KIND
}

export function stagedObligationMatchesCheckout(input: {
  agreement: AgreementRow
  obligation: ObligationRow
  session: Stripe.Checkout.Session
  account: string | null
}) {
  const metadata = input.session.metadata ?? {}
  const paymentIntentId = typeof input.session.payment_intent === 'string'
    ? input.session.payment_intent
    : input.session.payment_intent?.id ?? null
  return Boolean(
    input.account
    && input.account === input.agreement.stripe_connect_account_id
    && metadata.nexez_staged_settlement_id === input.agreement.id
    && metadata.nexez_staged_obligation_id === input.obligation.id
    && metadata.nexez_staged_stage_id === input.obligation.stage_id
    && metadata.nexez_staged_contract_fingerprint === input.agreement.contract_fingerprint
    && metadata.nexez_staged_approval_fingerprint === input.obligation.approval_fingerprint
    && input.obligation.agreement_id === input.agreement.id
    && input.obligation.stripe_checkout_session_id === input.session.id
    && (input.obligation.status === 'payment_pending'
      || (input.obligation.status === 'paid' && input.obligation.stripe_payment_intent_id === paymentIntentId))
    && input.session.payment_status === 'paid'
    && input.session.amount_total === input.obligation.amount_cents
    && (input.session.currency || '').toLowerCase() === input.agreement.currency
    && paymentIntentId,
  )
}

async function failRetry(event: Stripe.Event, message: string) {
  return NextResponse.json({ error: message, type: event.type }, { status: 500 })
}

async function processStagedSettlementStripeEvent(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session
  const metadata = session.metadata ?? {}
  const agreementId = metadata.nexez_staged_settlement_id
  const obligationId = metadata.nexez_staged_obligation_id
  if (!agreementId || !obligationId) {
    return failRetry(event, 'Staged settlement Checkout is missing agreement provenance.')
  }
  const admin = createAdminClient()
  const [{ data: agreement }, { data: obligation }] = await Promise.all([
    admin
      .from('staged_settlement_agreements')
      .select('id, owner_id, page_id, slug, offer_key, offer_name, status, contract_fingerprint, currency, stripe_connect_account_id, commission_bps, plan_id_at_purchase, commission_source, buyer_email, buyer_name, buyer_reference, buyer_agent')
      .eq('id', agreementId)
      .maybeSingle<AgreementRow>(),
    admin
      .from('staged_settlement_obligations')
      .select('id, agreement_id, stage_id, stage_order, label, amount_cents, status, approval_fingerprint, stripe_checkout_session_id, stripe_payment_intent_id, application_fee_cents')
      .eq('id', obligationId)
      .eq('agreement_id', agreementId)
      .maybeSingle<ObligationRow>(),
  ])
  if (!agreement || !obligation) return failRetry(event, 'Staged settlement agreement provenance was not found.')
  if (!stagedObligationMatchesCheckout({ agreement, obligation, session, account: eventAccount(event) })) {
    return NextResponse.json({
      received: true,
      type: event.type,
      stagedSettlement: false,
      reason: 'stale_or_mismatched_staged_checkout',
    })
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id as string
  const paidAt = new Date().toISOString()
  if (obligation.status !== 'paid') {
    const { data: updated, error } = await admin
      .from('staged_settlement_obligations')
      .update({
        status: 'paid',
        stripe_payment_intent_id: paymentIntentId,
        stripe_livemode: session.livemode,
        paid_at: paidAt,
        updated_at: paidAt,
      })
      .eq('id', obligation.id)
      .eq('agreement_id', agreement.id)
      .eq('status', 'payment_pending')
      .eq('stripe_checkout_session_id', session.id)
      .select('id')
      .maybeSingle()
    if (error || !updated) return failRetry(event, 'Could not mark the staged obligation paid.')
  }

  const buyerEmail = session.customer_details?.email || session.customer_email || agreement.buyer_email
  const orderRow = {
    owner_id: agreement.owner_id,
    page_id: agreement.page_id,
    slug: agreement.slug,
    offer_name: `${agreement.offer_name}: ${obligation.label}`,
    offer_key: agreement.offer_key,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_connect_account_id: eventAccount(event),
    amount_cents: obligation.amount_cents,
    currency: agreement.currency,
    application_fee_cents: obligation.application_fee_cents ?? 0,
    commission_bps: agreement.commission_bps,
    commission_percent: agreement.commission_bps == null ? null : agreement.commission_bps / 100,
    plan_id_at_purchase: agreement.plan_id_at_purchase,
    commission_source: agreement.commission_source,
    stripe_livemode: session.livemode,
    status: 'paid',
    channel: 'staged_settlement',
    staged_settlement_agreement_id: agreement.id,
    staged_settlement_obligation_id: obligation.id,
    metadata: {
      staged_settlement_contract_fingerprint: agreement.contract_fingerprint,
      staged_settlement_stage_id: obligation.stage_id,
      staged_settlement_stage_order: obligation.stage_order,
      staged_settlement_approval_fingerprint: obligation.approval_fingerprint,
    },
    ...bearerTokenColumns(mintBearerToken(), 'access_token'),
    ...(buyerEmail ? { buyer_email: buyerEmail.toLowerCase() } : {}),
    ...(agreement.buyer_name ? { buyer_name: agreement.buyer_name } : {}),
    ...(agreement.buyer_reference ? { buyer_reference: agreement.buyer_reference } : {}),
    ...(agreement.buyer_agent ? { buyer_agent: agreement.buyer_agent } : {}),
  }
  const { error: orderError } = await admin
    .from('checkout_orders')
    .upsert(orderRow, { onConflict: 'stripe_session_id' })
  if (orderError) return failRetry(event, 'Could not persist the staged settlement order.')

  return NextResponse.json({
    received: true,
    type: event.type,
    stagedSettlement: true,
    agreement: agreement.id,
    obligation: obligation.id,
    status: 'paid',
  })
}

export async function handleStagedSettlementStripeEvent(event: Stripe.Event): Promise<Response> {
  return withStripeWebhookLease(event, () => processStagedSettlementStripeEvent(event))
}
