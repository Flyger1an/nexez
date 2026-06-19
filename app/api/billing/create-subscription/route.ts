import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { getBillingPlan, getPlanPriceId, isStripePriceId } from '../../../../lib/billing'

/**
 * Creates a Stripe Subscription for recurring paid plans using Embedded Components flow.
 * 
 * Returns a client_secret from the Subscription's latest_invoice.payment_intent
 * so the client can use <PaymentElement> + stripe.confirmPayment() without leaving the page.
 * 
 * - Only for paid plans (Launch/Pro/Scale/Enterprise). Free has no sub.
 * - Separate from transaction commissions (handled via Stripe Connect + app fees in /api/checkout).
 * - Webhook (customer.subscription.* + checkout if any) will sync full state to billing_subscriptions.
 * - Production: errors logged, auth required, env checks, customer reuse.
 */

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const planId = String(body.plan || body.planId || '')
    const plan = getBillingPlan(planId)

    if (!plan || plan.id === 'free' || plan.id === 'enterprise') {
      return NextResponse.json(
        { error: 'Invalid or unsupported plan for self-serve subscription. Use Enterprise contact sales or Free tier.' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const priceId = getPlanPriceId(plan)
    if (!process.env.STRIPE_SECRET_KEY || !priceId) {
      console.error('[billing/create-subscription] Stripe not configured for plan', plan.id)
      return NextResponse.json({ error: 'Stripe Billing is not configured for this plan yet. Add the Stripe secret key and plan Price ID, then try again.' }, { status: 412 })
    }
    // Guard the common misconfiguration up front: a value that isn't a Stripe Price ID
    // (e.g. a "prod_…" product id pasted by mistake) would otherwise reach Stripe and
    // 500. A TEST price id under LIVE keys still passes this check — Stripe's "no such
    // price" path below catches that and returns the same actionable guidance.
    if (!isStripePriceId(priceId)) {
      console.error('[billing/create-subscription] plan price id is not a Stripe Price id', { plan: plan.id, priceId })
      return NextResponse.json(
        { error: 'Stripe Billing for this plan is misconfigured: the configured value is not a Stripe Price ID (it must start with "price_"). Set the plan’s STRIPE_PRICE_… env var to the live Price ID and redeploy.' },
        { status: 412 },
      )
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    // Get or reuse existing customer from our billing_subscriptions (dual model row)
    const { data: billingState } = await supabase
      .from('billing_subscriptions')
      .select('stripe_customer_id, plan_id, status')
      .eq('owner_id', user.id)
      .maybeSingle<{ stripe_customer_id: string | null; plan_id: string | null; status: string | null }>()

    let customerId = billingState?.stripe_customer_id || null

    if (!customerId) {
      // Create customer in Stripe (idempotent-ish via metadata)
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: {
          nexez_user_id: user.id,
          nexez_source: 'embedded_subscription',
        },
      })
      customerId = customer.id

      // Upsert a preliminary row so the webhook can find this customer by owner_id.
      // Deliberately DO NOT write plan_id here — payment hasn't happened yet, and the
      // billing UI derives the active plan from plan_id. Writing it optimistically made
      // an abandoned checkout show a plan the user never paid for. The webhook
      // (customer.subscription.* / checkout.session.completed) sets plan_id on confirmation.
      // Must use the service-role client: RLS allows owners SELECT but not insert/update
      // on billing_subscriptions, so a session-client write is silently rejected (which
      // left the customer id unlinked and the subscription state unsynced).
      if (hasSupabaseAdminEnv()) {
        const { error: linkError } = await createAdminClient().from('billing_subscriptions').upsert({
          owner_id: user.id,
          stripe_customer_id: customerId,
          status: 'incomplete',
          metadata: { source: 'create-subscription', created_via: 'embedded' },
        }, { onConflict: 'owner_id' })
        if (linkError) console.error('[billing/create-subscription] failed to persist stripe_customer_id', linkError)
      } else {
        console.warn('[billing/create-subscription] admin env missing — customer id not persisted; webhook will backfill via metadata')
      }
    }

    // Create the subscription in incomplete state so we get a client_secret for Elements.
    // This is the standard pattern for Stripe Embedded + Subscriptions (Payment Element).
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        nexez_user_id: user.id,
        nexez_plan: plan.id,
        nexez_price_id: priceId,
        nexez_source: 'embedded_billing',
      },
    })

    const invoice = subscription.latest_invoice as any
    const paymentIntent = (invoice?.payment_intent || (invoice as any)?.payment_intent) as Stripe.PaymentIntent | null

    if (!paymentIntent?.client_secret) {
      console.error('[billing/create-subscription] No client_secret returned', { subId: subscription.id })
      return NextResponse.json({ error: 'Failed to initialize payment for subscription.' }, { status: 500 })
    }

    // Return everything the client needs for <Elements> + confirmPayment
    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
      customerId,
      planId: plan.id,
      priceId,
      // status will be 'incomplete' until confirmed + webhook
    })
  } catch (err: any) {
    console.error('[billing/create-subscription] Error creating embedded subscription', err)

    if (isStripePriceMisconfigurationError(err)) {
      return NextResponse.json(
        {
          error:
            'Stripe Billing for this plan is misconfigured. Open the plan in Stripe, copy the live Price ID from the pricing section, update STRIPE_PRICE_…, then redeploy.',
        },
        { status: 412 },
      )
    }

    return NextResponse.json({ error: 'Could not start secure checkout. Please try again or contact support if this continues.' }, { status: 500 })
  }
}

function isStripePriceMisconfigurationError(err: any) {
  const message = String(err?.message || '').toLowerCase()
  const code = String(err?.code || '')
  const param = String(err?.param || '')

  return message.includes('no such price') || (code === 'resource_missing' && param.includes('price'))
}
