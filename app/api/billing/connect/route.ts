import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createStripeConnectAccount, createStripeConnectOnboardingLink } from '../../../../lib/stripe-billing'
import { appUrl } from '../../../../lib/site'
import { billingPlans } from '../../../../lib/billing'
import Stripe from 'stripe'

/**
 * Stripe Connect onboarding for business owners (for transaction payments).
 * Separate from subscription billing (which is Nexez charging the owner).
 * Express accounts for quick setup.
 * Stores account id in billing_subscriptions.stripe_connect_account_id
 */
export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore, requestUrl.host)
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
  if (requestUrl.searchParams.get('refresh') === 'true') {
    return NextResponse.json({ refreshed: true, ...statusUpdate })
  }

  // If the caller is mid-funnel on a paid plan (e.g. the onboarding wizard),
  // thread that plan through the return URL so payouts onboarding lands back on
  // billing with checkout auto-opening for that plan — keeping subscription +
  // payouts setup one coherent flow instead of dropping the subscription.
  const body = await request.json().catch(() => ({} as { plan?: string }))
  const requestedPlan = typeof body?.plan === 'string' ? body.plan : ''
  const resumePlan = billingPlans.find((p) => p.id === requestedPlan && p.envVar && p.id !== 'enterprise')?.id

  // Create onboarding / manage link (Stripe will show the appropriate flow for the account state)
  // Redirect back to billing page after Stripe Connect onboarding so the status/refetch logic can run immediately.
  const returnUrl = appUrl(`/dashboard/billing?connect=success${resumePlan ? `&plan=${resumePlan}` : ''}`)
  const refreshUrl = appUrl('/dashboard/billing?connect=refresh')

  try {
    const link = await createStripeConnectOnboardingLink(accountId, returnUrl, refreshUrl)
    return NextResponse.json({ url: link.url })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to create onboarding link: ' + e.message }, { status: 500 })
  }
}
