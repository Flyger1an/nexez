import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { getBaseUrl } from '../../../../lib/agent-page'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { isPayable } from '../../../../lib/settlement'
import { getCommissionPercentForPlan, calculateApplicationFeeCents } from '../../../../lib/stripe-billing'
import { minorToStripeAmount } from '../../../../lib/currency'
import { parseBuyerIdentity } from '../../../../lib/buyer-identity'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { getOwnerPlanId, getOwnerBillingState } from '../../../../lib/server/plan'
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
 * an application fee (falls back to the platform account if the owner hasn't connected).
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
    .eq('status_token', token)
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
  if (!isPayable(negotiation.settlement_state)) {
    return fail(409, 'This agreement is awaiting seller approval before payment.', {
      settlementState: negotiation.settlement_state,
    })
  }

  // Connect routing: owner is merchant of record, Nexez takes the plan commission as
  // an application fee. Mirrors app/api/checkout/route.ts.
  let connectAccountId: string | null = null
  // Status-aware plan resolution (canceled/incomplete 'pro' → Free 15%, not 6%) -
  // single source of truth, mirrors app/api/checkout/route.ts and entitlements.
  const ownerPlanId = await getOwnerPlanId(admin, negotiation.owner_id as string)
  // Compatibility hook for an explicit operational suspension. Billing or
  // promotional expiry falls back to Free and remains payable at the Free fee.
  if ((await getOwnerBillingState(admin, negotiation.owner_id as string)).isPaused) {
    return fail(402, 'This seller’s storefront is paused and not accepting orders right now.')
  }
  const { data: billing } = await admin
    .from('billing_subscriptions')
    .select('stripe_connect_account_id, stripe_connect_charges_enabled')
    .eq('owner_id', negotiation.owner_id as string)
    .maybeSingle<{ stripe_connect_account_id: string | null; stripe_connect_charges_enabled: boolean | null }>()
  // Only route to a Connect account that can actually ACCEPT a charge (onboarding
  // complete). An id without charges_enabled would create a dead-end session, so
  // treat it as not-connected (→ the owner_not_connected fallback below).
  if (billing?.stripe_connect_account_id && billing.stripe_connect_charges_enabled === true) {
    connectAccountId = billing.stripe_connect_account_id
  }
  const commissionPercent = getCommissionPercentForPlan(ownerPlanId)

  // Never route the payment through the PLATFORM account: without the seller's
  // Connect account they can't receive the funds and it creates a payout/money-
  // transmission liability. The seller must connect Stripe payouts before an
  // agreement can be paid.
  if (!connectAccountId) {
    return fail(409, 'This seller hasn’t connected Stripe payouts yet, so this agreement can’t be paid. Ask the seller to connect payouts, then try again.', {
      code: 'owner_not_connected',
    })
  }

  const stripe = new Stripe(secret)
  const requestOptions = { stripeAccount: connectAccountId }

  const autoSettle = negotiation.settlement_state === 'auto'
  const currency = (negotiation.currency || 'usd').toLowerCase()
  // amount_cents is stored as 2-decimal minor units (major × 100) regardless of
  // currency; convert to Stripe's smallest unit for THIS currency so zero-decimal
  // currencies (JPY/KRW) aren't charged 100x. The webhook validates the completed
  // session against the same conversion (minorToStripeAmount).
  const chargeAmount = minorToStripeAmount(negotiation.amount_cents, currency)
  const applicationFeeAmount = calculateApplicationFeeCents(chargeAmount, commissionPercent)
  const fingerprint = paymentFingerprint({
    amountCents: chargeAmount,
    currency,
    settlementState: negotiation.settlement_state,
    connectAccountId,
    applicationFeeAmount,
  })

  // Idempotent reuse: only reuse a still-open Checkout session if it exactly
  // matches the current money terms. Amount/fee/settlement can change while an
  // old buyer tab is open; blindly reusing that session lets the buyer underpay.
  if (negotiation.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(negotiation.stripe_checkout_session_id, undefined, requestOptions)
      const existingUrl = existing.url
      const sameTerms =
        existing.status === 'open' &&
        existingUrl &&
        existing.amount_total === chargeAmount &&
        existing.currency?.toLowerCase() === currency &&
        existing.metadata?.nexez_payment_fingerprint === fingerprint
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
        nexez_commission_percent: String(commissionPercent),
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
      .update({ stripe_checkout_session_id: session.id })
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
