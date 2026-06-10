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

  const stripe = new Stripe(secret)

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

  // Always refresh the latest status from Stripe.
  // These fields (details_submitted, charges_enabled, payouts_enabled) are updated asynchronously
  // by Stripe after the user completes steps or after review.
  let statusUpdate: Record<string, any> = {}
  try {
    const account = await stripe.accounts.retrieve(accountId)
    statusUpdate = {
      stripe_connect_status: account.details_submitted ? 'complete' : 'pending',
      stripe_connect_details_submitted: account.details_submitted,
      stripe_connect_charges_enabled: account.charges_enabled,
      stripe_connect_payouts_enabled: account.payouts_enabled,
    }
    await supabase.from('billing_subscriptions').update(statusUpdate).eq('owner_id', user.id)
  } catch (e: any) {
    console.error('Failed to retrieve/update Connect account status', e)
  }

  // If caller just wants a status refresh (no redirect), return early
  const requestUrl = new URL(request.url)
  if (requestUrl.searchParams.get('refresh') === 'true') {
    return NextResponse.json({ refreshed: true, ...statusUpdate })
  }

  // Create onboarding / manage link (Stripe will show the appropriate flow for the account state)
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