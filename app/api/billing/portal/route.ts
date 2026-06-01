import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getBaseUrl } from '../../../../lib/agent-page'
import { createClient } from '../../../../utils/supabase/server'

/**
 * Stripe Billing Portal for Nexez subscriptions (lean MVP).
 * Creates a portal session so users can manage their subscription,
 * update payment methods, cancel, etc.
 *
 * For true customer lookup we ideally store stripe_customer_id after checkout success.
 * This version falls back to email lookup (good enough for early MVP).
 */

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(`${getBaseUrl()}/dashboard/billing?setup=stripe`, 303)
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${getBaseUrl()}/login?next=/dashboard/billing`, 303)
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // Best effort: find existing customer by email
    const customers = await stripe.customers.list({
      email: user.email || undefined,
      limit: 1,
    })

    let customerId = customers.data[0]?.id

    if (!customerId) {
      // Create a minimal customer so portal works
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { nexez_user_id: user.id },
      })
      customerId = customer.id
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getBaseUrl()}/dashboard/billing`,
    })

    return NextResponse.redirect(portal.url || `${getBaseUrl()}/dashboard/billing`, 303)
  } catch (error: any) {
    console.error('Stripe portal error', error)
    return NextResponse.redirect(`${getBaseUrl()}/dashboard/billing?error=portal`, 303)
  }
}
