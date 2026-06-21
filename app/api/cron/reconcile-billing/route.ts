import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'
import { buildBillingSubscriptionRow } from '../../../../lib/stripe-billing'

// Bound the work per run so the cron stays fast and within Stripe rate limits.
const LIMIT = 100
export const maxDuration = 60

/**
 * Billing subscription reconciliation (Vercel cron — see vercel.json). The backstop
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

  // Trial-expiry pass: flip expired no-card trials to 'paused' (storefront offline). These are
  // DB-only trials (no Stripe customer), so the Stripe reconcile below skips them. The status
  // flip fires the serving-resync trigger → the seller's public listings go offline until they
  // subscribe. The status='trialing' guard avoids racing a conversion that just landed.
  let pausedTrials = 0
  const { data: expired } = await admin
    .from('billing_subscriptions')
    .select('owner_id')
    .eq('account_origin', 'trial')
    .eq('status', 'trialing')
    .lt('trial_ends_at', new Date().toISOString())
    .is('stripe_customer_id', null)
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
    .select('owner_id, stripe_customer_id, stripe_subscription_id, plan_id, status')
    .not('stripe_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(LIMIT)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  let healed = 0
  let unchanged = 0
  let alerted = 0
  const actions: Array<Record<string, unknown>> = []

  for (const row of rows) {
    try {
      // Prefer the active/trialing subscription; fall back to the most recent.
      const list = await stripe.subscriptions.list({
        customer: row.stripe_customer_id as string,
        status: 'all',
        limit: 5,
        expand: ['data.items.data.price'],
      })
      const live = list.data.find((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')
      const subscription = live ?? list.data[0] ?? null

      if (!subscription) {
        // No subscription in Stripe — our row must not claim a paid plan.
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
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, healed, unchanged, alerted, pausedTrials, actions, ran_at: new Date().toISOString() })
}
