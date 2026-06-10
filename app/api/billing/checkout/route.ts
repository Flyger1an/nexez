import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getBaseUrl } from '../../../../lib/agent-page'
import { getBillingPlan, getPlanPriceId } from '../../../../lib/billing'
import { createClient } from '../../../../utils/supabase/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const planId = String(formData.get('plan') || '')
  const plan = getBillingPlan(planId)

  if (!plan) {
    return NextResponse.redirect(`${getBaseUrl()}/dashboard/billing?error=plan`, 303)
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${getBaseUrl()}/login?next=/dashboard/billing`, 303)
  }

  const priceId = getPlanPriceId(plan)

  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return NextResponse.redirect(`${getBaseUrl()}/dashboard/billing?setup=stripe`, 303)
  }

  const { data: billingState } = await supabase
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('owner_id', user.id)
    .maybeSingle<{ stripe_customer_id: string | null }>()

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    client_reference_id: user.id,
    ...(billingState?.stripe_customer_id
      ? { customer: billingState.stripe_customer_id }
      : { customer_email: user.email || undefined }),
    allow_promotion_codes: true,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${getBaseUrl()}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan.id}`,
    cancel_url: `${getBaseUrl()}/dashboard/billing?canceled=1`,
    metadata: {
      nexez_user_id: user.id,
      nexez_plan: plan.id,
      nexez_price_id: priceId,
      nexez_source: 'billing_page',
    },
    subscription_data: {
      metadata: {
        nexez_user_id: user.id,
        nexez_plan: plan.id,
        nexez_price_id: priceId,
      },
    },
  }

  let session
  try {
    session = await stripe.checkout.sessions.create(sessionParams)
  } catch (err: any) {
    console.error('[billing/checkout] Failed to create Stripe Checkout Session', err)

    let target = `${getBaseUrl()}/dashboard/billing?error=stripe`

    if (err.message && err.message.toLowerCase().includes('no such price')) {
      target = `${getBaseUrl()}/dashboard/billing?error=bad_price_id`
      // Note: the real cause is almost always STRIPE_PRICE_* env var set to a prod_xxx (product) instead of price_xxx (price)
    }

    return NextResponse.redirect(target, 303)
  }

  return NextResponse.redirect(session.url || `${getBaseUrl()}/dashboard/billing`, 303)
}
