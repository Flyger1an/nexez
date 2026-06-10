import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { getBillingPlan, getPlanPriceId } from '../../../../lib/billing'

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
      return NextResponse.json({ error: 'Stripe Billing is not configured. Set STRIPE_SECRET_KEY and plan price env vars.' }, { status: 412 })
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

      // Upsert preliminary row so webhook can find it easily (plan/status will be updated by events)
      await supabase.from('billing_subscriptions').upsert({
        owner_id: user.id,
        stripe_customer_id: customerId,
        plan_id: plan.id,
        status: 'incomplete',
        metadata: { source: 'create-subscription', created_via: 'embedded' },
      }, { onConflict: 'owner_id' })
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

    let friendlyError = 'Failed to create subscription: ' + (err.message || 'Unknown error')

    // Helpful message for the common misconfiguration (using prod_ instead of price_)
    if (err.message && err.message.toLowerCase().includes('no such price')) {
      friendlyError = 'Failed to create subscription: The price ID configured for this plan is invalid. ' +
        'You have likely set one of the STRIPE_PRICE_* environment variables to a Product ID (prod_...) instead of a Price ID (price_...). ' +
        'Go to your Stripe Dashboard → Products, open the product, copy the actual Price ID from the pricing section, and update the corresponding env var (STRIPE_PRICE_LAUNCH etc.) in your hosting platform (Vercel). Then redeploy.'
    }

    return NextResponse.json({ error: friendlyError }, { status: 500 })
  }
}
