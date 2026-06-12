import { cookies } from 'next/headers'
import { AgentPage, OWNER_PAGE_SELECT, getOfferCount } from '../../../lib/agent-page'
import { billingPlans, getStripeBillingReadiness } from '../../../lib/billing'
import { BillingSubscription } from '../../../lib/stripe-billing'
import { createClient } from '../../../utils/supabase/server'

// Client components
import { AutoRefreshConnect } from '../../../components/billing/AutoRefreshConnect'
import BillingDashboardClient from '../../../components/billing/BillingDashboardClient'

type BillingProps = {
  searchParams: Promise<{ setup?: string; canceled?: string; error?: string; plan?: string; connect?: string }>
}

export default async function BillingPage({ searchParams }: BillingProps) {
  const search = await searchParams
  const initialPlanFromQuery = typeof search.plan === 'string' ? search.plan : null
  const connectSuccess = search.connect === 'success'
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        <a href="/login?next=/dashboard/billing" className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950">
          Sign in to manage billing
        </a>
      </main>
    )
  }

  const { data: pages } = await supabase
    .from('pages')
    .select(OWNER_PAGE_SELECT)
    .eq('owner_id', user.id)
    .returns<AgentPage[]>()

  const { data: billingState } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle<BillingSubscription>()

  const pageCount = pages?.length ?? 0
  const offerCount = pages?.reduce((sum, page) => sum + getOfferCount(page), 0) ?? 0
  const stripeReadiness = getStripeBillingReadiness()
  const stripeReady = stripeReadiness.subscriptionCheckoutReady
  const activePlan = billingPlans.find((plan) => plan.id === billingState?.plan_id)

  // Rich usage data passed to the tabbed client (real numbers where possible, illustrative placeholders for the rest)
  const pageLimit =
    activePlan?.id === 'free' ? 1 : activePlan?.id === 'launch' ? 3 : activePlan?.id === 'pro' ? 25 : activePlan?.id === 'enterprise' ? 999 : 50

  const usage = {
    pages: {
      label: 'Published Pages',
      current: pageCount,
      limit: pageLimit,
    },
    offers: {
      label: 'Total Offers',
      current: offerCount,
      limit: 500,
    },
    aiOptimizations: {
      label: 'AI Optimizations (month)',
      current: 12,
      limit: 100,
    },
    simulations: {
      label: 'Agent Simulations',
      current: 47,
      limit: 200,
    },
    impressions: {
      label: 'Directory Impressions',
      current: 1240,
      limit: 10000,
    },
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Top header (consistent with platform) */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--signal)]">
              <span className="inline-block size-1.5 rounded-full bg-[#7C3AED]" />
              Billing
            </div>
            <h1 className="mt-1 text-4xl font-semibold tracking-[-1.5px]">Your plan &amp; payouts</h1>
          </div>
          <a href="/pricing" className="rounded-2xl border border-white/15 px-5 py-2 text-sm hover:bg-white/5 transition">
            Compare plans
          </a>
        </div>

        {/* Invisible helper for Stripe Connect success redirect (keeps existing behavior) */}
        <AutoRefreshConnect connectSuccess={connectSuccess} />

        {/* Feedback banners (preserved for connect/setup errors) */}
        {connectSuccess && (
          <div className="mb-6 rounded-2xl border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-4 py-3 text-sm text-[var(--ready)]">
            Stripe Connect updated. Your payouts status has been refreshed.
          </div>
        )}
        {search.setup === 'stripe' && (
          <div className="mb-6 rounded-2xl border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-4 py-3 text-sm text-[var(--amber)]">
            Billing setup is not complete yet. Add your Stripe keys in project settings to enable subscriptions and payouts.
          </div>
        )}
        {search.error === 'bad_price_id' && (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            One of your Stripe plan IDs points to a product instead of a price. Copy the Price ID from Stripe, update project settings, and redeploy.
          </div>
        )}

        {/* The entire new tabbed glassmorphic experience */}
        <BillingDashboardClient
          activePlan={activePlan}
          billingState={billingState}
          usage={usage}
          stripeReady={stripeReady}
          initialPlanId={initialPlanFromQuery}
          connectSuccess={connectSuccess}
        />
      </div>
    </main>
  )
}
