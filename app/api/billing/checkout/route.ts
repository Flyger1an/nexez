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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email || undefined,
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
      nexez_source: 'billing_page',
    },
    subscription_data: {
      metadata: {
        nexez_user_id: user.id,
        nexez_plan: plan.id,
      },
    },
  })

  return NextResponse.redirect(session.url || `${getBaseUrl()}/dashboard/billing`, 303)
}
