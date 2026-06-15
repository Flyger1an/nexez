import { CheckCircle2, CreditCard, ArrowRight } from 'lucide-react'
import { cookies } from 'next/headers'
import { getBillingPlan } from '../../../../lib/billing'
import { createClient } from '../../../../utils/supabase/server'
import { syncCheckoutSessionForOwner } from '../../../../lib/server/sync-checkout-session'

type SuccessProps = {
  searchParams: Promise<{
    session_id?: string;
    plan?: string;
    embedded_success?: string;
  }>
}

export default async function BillingSuccessPage({ searchParams }: SuccessProps) {
  const { session_id: sessionId, plan: planId, embedded_success } = await searchParams
  const isEmbedded = !!embedded_success

  // Read-your-write: reconcile the just-completed session into billing_subscriptions
  // now, so the dashboard shows the new plan immediately (not after webhook latency).
  // Falls back silently to the webhook if anything is unavailable.
  let syncedPlanId: string | null = null
  let payoutsEnabled = true // default true → only show the connect-payout nudge when we KNOW it's missing
  if (sessionId) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const synced = await syncCheckoutSessionForOwner(sessionId, user.id)
      syncedPlanId = synced?.planId ?? null
      const { data: billing } = await supabase
        .from('billing_subscriptions')
        .select('stripe_connect_payouts_enabled')
        .eq('owner_id', user.id)
        .maybeSingle<{ stripe_connect_payouts_enabled: boolean | null }>()
      payoutsEnabled = Boolean(billing?.stripe_connect_payouts_enabled)
    }
  }

  // Prefer the plan we just confirmed from Stripe over the (spoofable) query param.
  const plan = getBillingPlan(syncedPlanId || planId)

  const heading = plan 
    ? `${plan.name} is active` 
    : 'Plan activated'

  const description = isEmbedded
    ? 'Your subscription was successfully created using Stripe\'s secure embedded checkout. The payment was confirmed in-page with the Payment Element.'
    : 'Stripe created a subscription checkout session for this Nexez workspace.'

  const sessionLabel = isEmbedded ? 'Confirmation' : 'Stripe session'
  const sessionValue = isEmbedded 
    ? 'Embedded flow (no hosted session ID)' 
    : (sessionId || 'No session id provided')

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <section className="card !p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--ready)] text-zinc-950">
            <CheckCircle2 className="size-9" />
          </div>

          <p className="mt-6 text-sm font-medium text-[var(--signal)]">
            {isEmbedded ? 'Embedded subscription confirmed' : 'Subscription checkout complete'}
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {heading}
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            {description}
          </p>

          <div className="mt-7 card !p-4 text-left text-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{sessionLabel}</p>
            <p className="mt-2 break-all font-mono text-zinc-200">{sessionValue}</p>
            {plan && (
              <p className="mt-2 text-xs text-[#9CA3AF]">
                Plan: {plan.name} ({plan.price}/{plan.cadence}) • Platform commission: {plan.commissionPercent}%
              </p>
            )}
          </div>

          {!payoutsEnabled && (
            <div className="mt-7 rounded-xl border border-[var(--ready)]/30 bg-[var(--ready)]/10 p-4 text-left">
              <p className="font-medium text-white">One more step to get paid</p>
              <p className="mt-1 text-sm text-zinc-400">
                Your plan is active. Now connect your payout account so agents can pay you directly on every sale.
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            {!payoutsEnabled && (
              <a
                href="/dashboard/billing?tab=fees"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--ready)] px-5 py-3 text-sm font-semibold text-zinc-950 hover:opacity-90"
              >
                <CreditCard className="size-4" />
                Connect payout account
              </a>
            )}
            <a
              href="/dashboard/billing"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--signal-solid)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              <CreditCard className="size-4" />
              View Billing &amp; Plan
            </a>

            <a 
              href="/dashboard" 
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              Go to Dashboard
              <ArrowRight className="size-4" />
            </a>
          </div>

          <p className="mt-6 text-xs text-zinc-500 max-w-md mx-auto">
            {syncedPlanId
              ? 'Your subscription is active and your workspace is updated. Manage billing, update payment methods, or cancel via the Stripe portal linked from your Billing dashboard.'
              : isEmbedded
                ? 'Your billing status will update shortly once the webhook syncs the subscription details. You can manage everything (cancel, update payment method) via the Stripe portal from the Billing page.'
                : 'Your subscription is now active. Manage billing, update payment methods, or cancel via the Stripe portal linked from your Billing dashboard.'}
          </p>
        </section>
      </div>
    </main>
  )
}
