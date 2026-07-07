import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'
import { reconcilePaymentState, type StripePiStatus } from '../../../../lib/escrow-reconcile'
import { stripeObjectId } from '../../../../lib/stripe-billing'
import type { NegotiationStatus } from '../../../../lib/negotiations'

// Bound the work per run so the cron stays fast and within Stripe rate limits.
const LIMIT = 50
export const maxDuration = 60

/**
 * Escrow reconciliation (Vercel cron - see vercel.json). The money-side backstop:
 * for negotiations that have a Stripe payment intent and aren't in a settled-terminal
 * state, compare our status against the true Stripe PI state and self-heal the
 * unambiguous drift (succeeded→complete, canceled→declined, refunded→refunded).
 * Ambiguous drift is reported via captureError instead of being guessed.
 *
 * Protected: scheduled runs must send `Authorization: Bearer ${CRON_SECRET}`.
 * Local dev may run without the secret; production never should.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: 'stripe_not_configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const stripe = new Stripe(stripeKey)

  // Cache the owner→connected-account lookup so each retrieve hits the right account.
  const connectByOwner = new Map<string, string | null>()
  async function connectFor(ownerId: string | null): Promise<string | undefined> {
    if (!ownerId) return undefined
    if (!connectByOwner.has(ownerId)) {
      const { data: b } = await admin
        .from('billing_subscriptions')
        .select('stripe_connect_account_id')
        .eq('owner_id', ownerId)
        .maybeSingle<{ stripe_connect_account_id: string | null }>()
      connectByOwner.set(ownerId, b?.stripe_connect_account_id ?? null)
    }
    return connectByOwner.get(ownerId) || undefined
  }

  // Backfill pass: a paid Checkout session whose webhook never landed (e.g. the
  // connected-account endpoint wasn't configured) leaves the negotiation with a
  // session id but NO payment intent - invisible to the PI-based scan below, so a
  // missed webhook would strand real money. Resolve the session on the connected
  // account and persist its PI so the reconcile loop can heal it this same run.
  let backfilled = 0
  const { data: sessionOnly } = await admin
    .from('agent_negotiations')
    .select('id, owner_id, stripe_checkout_session_id')
    .is('stripe_payment_intent_id', null)
    .not('stripe_checkout_session_id', 'is', null)
    .in('status', ['agreement_proposed', 'held'])
    .order('updated_at', { ascending: false })
    .limit(LIMIT)
  for (const row of sessionOnly ?? []) {
    try {
      const stripeAccount = await connectFor(row.owner_id)
      const session = await stripe.checkout.sessions.retrieve(
        row.stripe_checkout_session_id as string,
        { expand: ['payment_intent'] },
        stripeAccount ? { stripeAccount } : undefined,
      )
      const piId = stripeObjectId(session.payment_intent)
      if (session.payment_status === 'paid' && piId) {
        const { error: upErr } = await admin
          .from('agent_negotiations')
          .update({ stripe_payment_intent_id: piId, updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .is('stripe_payment_intent_id', null)
        if (!upErr) backfilled += 1
      }
    } catch {
      // Unreadable/foreign/expired session - skip; a later run retries.
    }
  }

  // Candidates: have a PI (including any just backfilled), not in a settled-terminal
  // state (complete/refunded/disputed are settled; declined/expired carry no live
  // money). Newest first, bounded.
  const { data, error } = await admin
    .from('agent_negotiations')
    .select('id, owner_id, status, settlement_state, stripe_payment_intent_id')
    .not('stripe_payment_intent_id', 'is', null)
    .in('status', ['agreement_proposed', 'held'])
    .order('updated_at', { ascending: false })
    .limit(LIMIT)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = data ?? []

  let healed = 0
  let alerted = 0
  const actions: Array<Record<string, unknown>> = []

  for (const row of rows) {
    let piStatus: StripePiStatus | null = null
    let refunded = false
    let disputed = false
    try {
      const stripeAccount = await connectFor(row.owner_id)
      const pi = await stripe.paymentIntents.retrieve(
        row.stripe_payment_intent_id as string,
        { expand: ['latest_charge'] },
        stripeAccount ? { stripeAccount } : undefined,
      )
      piStatus = pi.status as StripePiStatus
      const charge = pi.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null
      refunded = Boolean(charge?.refunded || (charge?.amount_refunded ?? 0) > 0)
      disputed = Boolean(charge?.disputed)
    } catch {
      piStatus = null // unreadable - the helper decides whether that's alert-worthy
    }

    const result = reconcilePaymentState({
      status: row.status as NegotiationStatus,
      piStatus,
      refunded,
      disputed,
    })

    if (result.heal) {
      const { error: upErr } = await admin
        .from('agent_negotiations')
        .update({ status: result.toStatus, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (upErr) {
        captureError(new Error('reconcile heal failed'), { negotiationId: row.id, toStatus: result.toStatus, reason: result.reason, dbError: upErr.message })
        alerted += 1
      } else {
        healed += 1
        actions.push({ id: row.id, from: row.status, to: result.toStatus, reason: result.reason })
      }
    } else if ('alert' in result && result.alert) {
      captureError(new Error('escrow reconciliation drift'), { negotiationId: row.id, status: row.status, piStatus, reason: result.reason })
      alerted += 1
      actions.push({ id: row.id, status: row.status, alert: result.reason })
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, backfilled, healed, alerted, actions, ran_at: new Date().toISOString() })
}
