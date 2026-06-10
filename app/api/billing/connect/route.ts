import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createStripeConnectAccount, createStripeConnectOnboardingLink } from '../../../../lib/stripe-billing'
import Stripe from 'stripe'

/**
 * Stripe Connect onboarding for business owners (for transaction payments).
 * Separate from subscription billing (which is Nexez charging the owner).
 * Express accounts for quick setup.
 * Stores account id in billing_subscriptions.stripe_connect_account_id
 */
export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ error: 'Stripe not configured for Connect.' }, { status: 412 })
  }

  // Get or create billing row for this owner
  const { data: billing } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()

  let accountId = billing?.stripe_connect_account_id

  if (!accountId) {
    // Create new Express account
    try {
      const account = await createStripeConnectAccount(
        user.id,
        user.email || '',
        (user.user_metadata as any)?.company || (user.user_metadata as any)?.full_name
      )
      accountId = account.id

      // Save to billing_subscriptions (create row if needed)
      await supabase.from('billing_subscriptions').upsert({
        owner_id: user.id,
        stripe_connect_account_id: accountId,
        stripe_connect_status: 'pending',
        plan_id: billing?.plan_id || 'free',
        status: billing?.status || 'unconfigured',
        metadata: { ...(billing?.metadata || {}), connect_onboarding_started: new Date().toISOString() },
      }, { onConflict: 'owner_id' })
    } catch (e: any) {
      console.error('Connect account create failed', e)
      return NextResponse.json({ error: 'Failed to create Stripe Connect account: ' + e.message }, { status: 500 })
    }
  }

  // Create onboarding link
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://nexez.app'
  const returnUrl = `${base}/dashboard/integrations?connect=success`
  const refreshUrl = `${base}/dashboard/integrations?connect=refresh`

  try {
    const link = await createStripeConnectOnboardingLink(accountId, returnUrl, refreshUrl)
    return NextResponse.json({ url: link.url })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to create onboarding link: ' + e.message }, { status: 500 })
  }
}