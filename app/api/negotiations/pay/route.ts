import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { getBaseUrl, getCheckoutOffer, SERVER_PAGE_SELECT, type AgentPage } from '../../../../lib/agent-page'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { isPayable } from '../../../../lib/settlement'
import { calculateApplicationFeeCentsFromBps } from '../../../../lib/stripe-billing'
import { minorToStripeAmount } from '../../../../lib/currency'
import { parseBuyerIdentity } from '../../../../lib/buyer-identity'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { hashBearerToken } from '../../../../lib/server/bearer-token'
import { resolveSettlementContext } from '../../../../lib/commerce/settlement-bridge'
import { getOfferStagedSettlementTerms } from '../../../../lib/configured-offer'
import type { AgentNegotiation } from '../../../../lib/negotiations'

function paymentFingerprint(input: {
  amountCents: number
  currency: string
  settlementState: string | null
  connectAccountId: string | null
  applicationFeeAmount?: number
}) {
  return [
    input.amountCents,
    input.currency.toLowerCase(),
    input.settlementState || 'none',
    input.connectAccountId || 'platform',
    input.applicationFeeAmount ?? 0,
  ].join(':')
}

/**
 * Buyer-facing escrow funding - the BUYER pays the agreed amount (not the owner).
 *
 * POST { negotiationId, token }
 *
 * The status token is the credential (same gate as /api/negotiations/status), so an
 * un-authenticated buying agent with the persistent /negotiate link can fund the deal.
 * Money routes to the OWNER's connected Stripe account with the platform commission as
 * an application fee. Funding is refused until the owner can receive Connect charges.
 *
 * Hybrid settlement:
 *  - settlement_state 'auto'      → immediate capture (low value) → webhook sets 'complete'.
 *  - settlement_state 'approved'  → manual-capture hold (high value, owner-approved) →
 *                                    webhook sets 'held', owner captures on delivery.
 *  - 'awaiting_approval'          → 409, the buyer must wait for owner approval.
 *
 * Idempotent: reuses a still-open Checkout session for the negotiation instead of
 * creating duplicates, and uses a Stripe idempotency key on creation.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'negotiation-pay', 30, 60_000, { failClosed: true })
  if (limited) return limited

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ error: 'Payments are not enabled on this deployment.' }, { status: 412 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Payment funding is not configured on this deployment.' }, { status: 503 })
  }

  // Agents POST JSON and read back {url}; the /negotiate page posts a form and we 303
  // them straight to Checkout.
  const wantsJson = !!request.headers.get('accept')?.includes('application/json')
  const contentType = request.headers.get('content-type') || ''
  let id = '', token = ''
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}))
    id = String(body.negotiationId || '').trim()
    token = String(body.token || '').trim()
  } else {
    const form = await request.formData().catch(() => null)
    id = String(form?.get('negotiationId') || '').trim()
    token = String(form?.get('token') || '').trim()
  }
  const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => {
    if (wantsJson) return NextResponse.json({ error, ...extra }, { status })
    const back = id && token ? `${getBaseUrl()}/negotiate/${id}?token=${token}&pay=error` : `${getBaseUrl()}/`
    return NextResponse.redirect(back, { status: 303 })
  }
  if (!id || !token) {
    return fail(400, 'negotiationId and token are required.')
  }

  const admin = createAdminClient()
  const { data: negotiation } = await admin
    .from('agent_negotiations')
    .select('*')
    .eq('id', id)
    .eq('status_token_sha256', hashBearerToken(token) ?? '')
    .maybeSingle<AgentNegotiation>()

  // Constant 404 on any mismatch - never reveal which negotiations exist.
  if (!negotiation) {
    return fail(404, 'Negotiation not found.')
  }

  if (negotiation.status !== 'agreement_proposed') {
    return fail(409, 'This negotiation is not awaiting payment.')
  }
  if (!negotiation.amount_cents || negotiation.amount_cents < 50) {
    return fail(409, 'No valid agreed amount to pay.')
  }

  const { data: page, error: pageError } = await admin
    .from('pages')
    .select(SERVER_PAGE_SELECT)
    .eq('id', negotiation.page_id)
    .maybeSingle<AgentPage>()
  if (pageError || !page) {
    return fail(409, 'The negotiated offer is no longer available for payment.')
  }
  const negotiatedOffer = getCheckoutOffer(page, negotiation.offer_key)
  if (!negotiatedOffer) {
    return fail(409, 'The negotiated offer is no longer available for payment.')
  }
  if (getOfferStagedSettlementTerms(negotiatedOffer)) {
    return fail(409, 'This agreement uses staged settlement, but per-stage checkout is not active yet.', {
      code: 'staged_settlement_runtime_not_available',
    })
  }
  if (!isPayable(negotiation.settlement_state)) {
    return fail(409, 'This agreement is awaiting seller approval before payment.', {
      settlementState: negotiation.settlement_state,
    })
  }

  // Owner is merchant of record. Resolve Connect readiness and immutable economics
  // through the same owner-aware core used by direct, ACP, and UCP settlement.
  const settlement = await resolveSettlementContext(admin, {
    pageId: negotiation.page_id ?? '',
    ownerId: negotiation.owner_id,
  })
  if (!settlement.ok && settlement.code === 'paused') {
    return fail(402, 'This seller’s storefront is paused and not accepting orders right now.')
  }
  // Never route payment through the PLATFORM account: without the seller's
  // Connect account they can't receive the funds and it creates a payout/money-
  // transmission liability. The seller must connect Stripe payouts before an
  // agreement can be paid.
  if (!settlement.ok) {
    return fail(409, 'This seller hasn’t connected Stripe payouts yet, so this agreement can’t be paid. Ask the seller to connect payouts, then try again.', {
      code: 'owner_not_connected',
    })
  }
  const money = settlement.context
  const connectAccountId = money.connectAccountId

  const stripe = new Stripe(secret)
  const requestOptions = { stripeAccount: connectAccountId }

  const autoSettle = negotiation.settlement_state === 'auto'
  const currency = (negotiation.currency || 'usd').toLowerCase()
  // amount_cents is stored as 2-decimal minor units (major × 100) regardless of
  // currency; convert to Stripe's smallest unit for THIS currency so zero-decimal
  // currencies (JPY/KRW) aren't charged 100x. The webhook validates the completed
  // session against the same conversion (minorToStripeAmount).
  const chargeAmount = minorToStripeAmount(negotiation.amount_cents, currency)
  const applicationFeeAmount = calculateApplicationFeeCentsFromBps(chargeAmount, money.commissionBps)
  const fingerprint = paymentFingerprint({
    amountCents: chargeAmount,
    currency,
    settlementState: negotiation.settlement_state,
    connectAccountId,
    applicationFeeAmount,
  })

  // Idempotent reuse: only reuse a still-open Checkout session if its buyer-facing
  // charge terms still match. The fee snapshot belongs to the already-created money
  // state; a later plan/rate change must not silently replace it.
  if (negotiation.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(negotiation.stripe_checkout_session_id, undefined, requestOptions)
      const existingUrl = existing.url
      const fingerprintWithoutFee = fingerprint.split(':').slice(0, 4).join(':')
      const existingFingerprintWithoutFee = existing.metadata?.nexez_payment_fingerprint
        ?.split(':')
        .slice(0, 4)
        .join(':')
      const sameTerms =
        existing.status === 'open' &&
        existingUrl &&
        existing.amount_total === chargeAmount &&
        existing.currency?.toLowerCase() === currency &&
        existingFingerprintWithoutFee === fingerprintWithoutFee
      if (sameTerms) {
        return wantsJson
          ? NextResponse.json({ ok: true, url: existingUrl, sessionId: existing.id, reused: true })
          : NextResponse.redirect(existingUrl, { status: 303 })
      }
    } catch {
      // Stale/foreign session id - fall through and create a fresh one.
    }
  }

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: chargeAmount,
            product_data: {
              name: `${negotiation.offer_name} - ${autoSettle ? 'payment' : 'escrow hold'}`,
            },
          },
          quantity: 1,
        },
      ],
      // 'auto' captures immediately; 'approved' holds (manual capture) for owner capture on delivery.
      payment_intent_data: {
        capture_method: autoSettle ? 'automatic' : 'manual',
        ...(applicationFeeAmount && applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
      },
      success_url: `${getBaseUrl()}/negotiate/${negotiation.id}?token=${token}&paid=1`,
      cancel_url: `${getBaseUrl()}/negotiate/${negotiation.id}?token=${token}&pay=cancelled`,
      metadata: {
        nexez_kind: 'negotiation_escrow',
        nexez_negotiation_id: negotiation.id,
        nexez_settlement: autoSettle ? 'auto' : 'hold',
        nexez_amount_cents: String(negotiation.amount_cents),
        nexez_currency: currency,
        nexez_connect_account: connectAccountId || '',
        nexez_application_fee_cents: String(applicationFeeAmount ?? 0),
        nexez_owner_plan: money.planId,
        nexez_commission_bps: String(money.commissionBps),
        nexez_commission_percent: String(money.commissionPercent),
        nexez_commission_source: money.commissionSource,
        nexez_payment_fingerprint: fingerprint,
      },
    }

    // Parity with direct checkout: prefill + lock Stripe's email field from the buyer
    // identity the negotiation already carries (buyer_email, else the contact field if
    // it's email-shaped). Improves buyer-email capture on funding + the receipt/portal.
    const buyerEmail = parseBuyerIdentity({ buyerEmail: negotiation.buyer_email || negotiation.contact }).email
    if (buyerEmail) {
      sessionParams.customer_email = buyerEmail
      sessionParams.metadata = { ...sessionParams.metadata, nexez_buyer_email: buyerEmail }
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      ...(requestOptions || {}),
      idempotencyKey: `escrow-${negotiation.id}-${fingerprint}`,
    })

    await admin
      .from('agent_negotiations')
      .update({
        stripe_checkout_session_id: session.id,
        commission_bps: money.commissionBps,
        commission_percent: money.commissionPercent,
        application_fee_cents: applicationFeeAmount,
        plan_id_at_purchase: money.planId,
        commission_source: money.commissionSource,
      })
      .eq('id', negotiation.id)

    if (!wantsJson && session.url) {
      return NextResponse.redirect(session.url, { status: 303 })
    }
    return NextResponse.json({ ok: true, url: session.url, sessionId: session.id, settlement: autoSettle ? 'auto' : 'hold' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create payment session.'
    return fail(502, message)
  }
}
