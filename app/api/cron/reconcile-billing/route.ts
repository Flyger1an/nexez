import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'
import {
  buildBillingSubscriptionRow,
  isDbManagedBillingStatus,
  pickLiveStripeSubscription,
  shouldSkipSubscriptionSync,
} from '../../../../lib/stripe-billing'

// Bound the work per run so the cron stays fast and within Stripe rate limits.
const LIMIT = 100
export const maxDuration = 60

/**
 * Billing subscription reconciliation (Vercel cron - see vercel.json). The backstop
 * for missed/unhandled Stripe webhooks: for every billing_subscriptions row that has
 * a Stripe customer, fetch the customer's live subscriptions and re-sync our row to
 * the truth. Heals plan/status/period drift; if the customer has no subscription at
 * all, the row is reset to canceled (so an abandoned 'incomplete' can't linger as a
 * paid plan). Without this, a single dropped webhook desyncs a plan permanently.
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

  // Trial-expiry pass: flip expired no-card trials to 'paused' (storefront offline). The
  // status flip fires the serving-resync trigger → the seller's public listings go offline
  // until they subscribe. Scope is EXACT via account_origin='trial' + status='trialing' +
  // expired trial_ends_at (only ever set on no-card trials) — do NOT also filter on a null
  // stripe_customer_id: a trial that merely opened (and abandoned) the embedded payment
  // sheet now carries a customer id while still 'trialing', and excluding it here let it
  // serve for free forever past expiry (the pause never fired). The .eq('status','trialing')
  // guard on the UPDATE still prevents clobbering a conversion that just landed as 'active'.
  let pausedTrials = 0
  const { data: expired } = await admin
    .from('billing_subscriptions')
    .select('owner_id')
    .eq('account_origin', 'trial')
    .eq('status', 'trialing')
    .lt('trial_ends_at', new Date().toISOString())
    .limit(LIMIT)
    .returns<Array<{ owner_id: string }>>()
  for (const r of expired ?? []) {
    const { error: pErr } = await admin
      .from('billing_subscriptions')
      .update({ status: 'paused' })
      .eq('owner_id', r.owner_id)
      .eq('status', 'trialing')
    if (!pErr) pausedTrials += 1
  }

  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('owner_id, stripe_customer_id, stripe_subscription_id, plan_id, status, last_reconciled_at')
    .not('stripe_customer_id', 'is', null)
    // Fair rotation: never keep scanning the newest LIMIT rows forever. Null/oldest
    // cursors go first, and every inspected row is stamped in the loop's finally block.
    .order('last_reconciled_at', { ascending: true, nullsFirst: true })
    .order('owner_id', { ascending: true })
    .limit(LIMIT)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  let healed = 0
  let unchanged = 0
  let alerted = 0
  const actions: Array<Record<string, unknown>> = []
  const reconciledAt = new Date().toISOString()

  for (const row of rows) {
    try {
      // Prefer the live subscription; fall back to the most recent SETTLED one -
      // never an incomplete/incomplete_expired sub (an opened-then-abandoned payment
      // sheet), which must not "reconcile" a live trial/paused/active row away.
      const list = await stripe.subscriptions.list({
        customer: row.stripe_customer_id as string,
        status: 'all',
        limit: 5,
        expand: ['data.items.data.price'],
      })
      const live = pickLiveStripeSubscription(list.data)
      const subscription = live ?? list.data.find((s) => !shouldSkipSubscriptionSync(s.status)) ?? null

      // DB-managed lifecycle (no-card trial / its expiry pause) has NO Stripe
      // subscription behind it - the row merely holds a customer id from an opened
      // payment sheet. Stripe silence is expected; only a LIVE subscription (a real
      // conversion) may overwrite these states. Without this guard the cron reset
      // in-window trials to 'canceled' (plan stripped) within the hour.
      if (!live && isDbManagedBillingStatus(row.status) && !row.stripe_subscription_id) {
        unchanged += 1
        continue
      }

      if (!subscription) {
        // No subscription in Stripe - our row must not claim a paid plan.
        if (row.plan_id || (row.status && row.status !== 'canceled')) {
          await admin
            .from('billing_subscriptions')
            .update({ plan_id: null, stripe_subscription_id: null, status: 'canceled' })
            .eq('owner_id', row.owner_id)
          healed += 1
          actions.push({ owner_id: row.owner_id, to: 'canceled', reason: 'no stripe subscription' })
        } else {
          unchanged += 1
        }
        continue
      }

      const rebuilt = buildBillingSubscriptionRow({
        ownerId: row.owner_id as string,
        subscription,
        // Parity with the webhook (syncBillingSubscription): fall back to the plan/price
        // stamped into subscription metadata at creation. Without this, a plan Price-ID env
        // drift (no local price→plan match) makes the hourly cron rebuild plan_id=null for
        // an ACTIVE paying subscriber — dropping entitlement + spiking commission to 15% —
        // and fight the webhook, which DOES carry the metadata fallback.
        fallbackPlanId: subscription.metadata?.nexez_plan,
        fallbackPriceId: subscription.metadata?.nexez_price_id,
        eventId: 'reconcile-billing',
        eventType: 'reconcile',
      })

      if (rebuilt.plan_id !== row.plan_id || rebuilt.status !== row.status || rebuilt.stripe_subscription_id !== row.stripe_subscription_id) {
        const { error: upErr } = await admin
          .from('billing_subscriptions')
          .upsert(rebuilt, { onConflict: 'owner_id' })
        if (upErr) {
          captureError(new Error('reconcile-billing heal failed'), { ownerId: row.owner_id, dbError: upErr.message })
          alerted += 1
        } else {
          healed += 1
          actions.push({ owner_id: row.owner_id, from: { plan: row.plan_id, status: row.status }, to: { plan: rebuilt.plan_id, status: rebuilt.status } })
        }
      } else {
        unchanged += 1
      }
    } catch (err) {
      captureError(err, { route: 'reconcile-billing', ownerId: row.owner_id })
      alerted += 1
    } finally {
      const { error: stampError } = await admin
        .from('billing_subscriptions')
        .update({ last_reconciled_at: reconciledAt })
        .eq('owner_id', row.owner_id)
      if (stampError) {
        captureError(new Error('reconcile-billing cursor stamp failed'), {
          ownerId: row.owner_id,
          dbError: stampError.message,
        })
        alerted += 1
      }
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, healed, unchanged, alerted, pausedTrials, actions, ran_at: new Date().toISOString() })
}
