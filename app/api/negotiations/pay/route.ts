import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { getBaseUrl } from '../../../../lib/agent-page'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { isPayable } from '../../../../lib/settlement'
import { getCommissionPercentForPlan, calculateApplicationFeeCents } from '../../../../lib/stripe-billing'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import type { AgentNegotiation } from '../../../../lib/negotiations'

/**
 * Buyer-facing escrow funding — the BUYER pays the agreed amount (not the owner).
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
  const limited = enforceRateLimit(request, 'negotiation-pay', 30, 60_000)
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

  // Constant 404 on any mismatch — never reveal which negotiations exist.
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
  let commissionPercent = 15
  const { data: billing } = await admin
    .from('billing_subscriptions')
    .select('plan_id, stripe_connect_account_id')
    .eq('owner_id', negotiation.owner_id as string)
    .maybeSingle<{ plan_id: string | null; stripe_connect_account_id: string | null }>()
  if (billing?.stripe_connect_account_id) connectAccountId = billing.stripe_connect_account_id
  commissionPercent = getCommissionPercentForPlan(billing?.plan_id as any)

  const stripe = new Stripe(secret)
  const requestOptions = connectAccountId ? { stripeAccount: connectAccountId } : undefined

  // Idempotent reuse: if we already created a session and it's still open, return it.
  if (negotiation.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(negotiation.stripe_checkout_session_id, undefined, requestOptions)
      if (existing.status === 'open' && existing.url) {
        return wantsJson
          ? NextResponse.json({ ok: true, url: existing.url, sessionId: existing.id, reused: true })
          : NextResponse.redirect(existing.url, { status: 303 })
      }
    } catch {
      // Stale/foreign session id — fall through and create a fresh one.
    }
  }

  const autoSettle = negotiation.settlement_state === 'auto'
  const applicationFeeAmount = connectAccountId
    ? calculateApplicationFeeCents(negotiation.amount_cents, commissionPercent)
    : undefined

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: negotiation.currency || 'usd',
            unit_amount: negotiation.amount_cents,
            product_data: {
              name: `${negotiation.offer_name} — ${autoSettle ? 'payment' : 'escrow hold'}`,
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
      },
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      ...(requestOptions || {}),
      idempotencyKey: `escrow-${negotiation.id}-${negotiation.settlement_state}`,
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
