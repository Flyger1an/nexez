import Stripe from 'stripe'
import { cookies } from 'next/headers'
import { AgentPage, OWNER_PAGE_SELECT, getOfferCount } from '../../../lib/agent-page'
import { billingPlans, getPlanLimits } from '../../../lib/billing'
import { getStripeBillingReadiness } from '../../../lib/server/billing-readiness'
import { getOwnerBillingState } from '../../../lib/server/plan'
import { BillingSubscription, getCommissionPercentForPlan } from '../../../lib/stripe-billing'
import {
  getAgentDrivenRevenueCents,
  getAgentPageVisitCount,
  getConversionCount,
  getDiscoveryClickCount,
  getRevenueCurrency,
} from '../../../lib/analytics'
import type { CheckoutEvent } from '../../../lib/checkout-events'
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

  // Canonical trial/paused lifecycle (trial-expiry aware) for the banner + active-plan
  // resolution. Days left is rounded up so "1 day left" shows on the final day.
  const trialState = await getOwnerBillingState(supabase, user.id)
  const trialDaysLeft = trialState.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialState.trialEndsAt).getTime() - new Date().getTime()) / 86_400_000))
    : 0
  const trialPlanName = billingPlans.find((p) => p.id === trialState.chosenPlanId)?.name ?? 'plan'

  const pageCount = pages?.length ?? 0
  const offerCount = pages?.reduce((sum, page) => sum + getOfferCount(page), 0) ?? 0

  // Real this-month engagement + platform-fee figures (replace the old placeholders).
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: monthEvents } = await supabase
    .from('checkout_events')
    .select('*')
    .eq('owner_id', user.id)
    .gte('created_at', monthStart.toISOString())
    .returns<CheckoutEvent[]>()
  const events = monthEvents ?? []
  const stripeReadiness = getStripeBillingReadiness()
  const stripeReady = stripeReadiness.subscriptionCheckoutReady
  const configuredPlanIds = stripeReadiness.configuredPlans.map((plan) => plan.id)
  // Only treat the stored plan as ACTIVE when the subscription is in a live state.
  // An abandoned/incomplete or canceled row must not show a plan the user isn't on
  // (it would otherwise inherit the plan_id written during checkout creation).
  // isLive is the trial-expiry-aware "conferring now" check (an expired trial is NOT live).
  const hasLiveSubscription = trialState.isLive && Boolean(trialState.chosenPlanId)
  const activePlan = hasLiveSubscription ? billingPlans.find((plan) => plan.id === trialState.chosenPlanId) : undefined

  // Page limit comes from the billing catalog (single source of truth); 999 is the
  // client's "unlimited" sentinel, so map the catalog's Infinity onto it.
  const planPageLimit = getPlanLimits(activePlan?.id).pages
  const pageLimit = Number.isFinite(planPageLimit) ? planPageLimit : 999

  // Real platform fee this month = agent-driven revenue × the plan's commission %.
  const commissionPct = getCommissionPercentForPlan(activePlan?.id ?? null)
  const agentRevenueCents = getAgentDrivenRevenueCents(events)
  const revenueCurrency = getRevenueCurrency(events)
  const platformFeesCents = Math.round((agentRevenueCents * commissionPct) / 100)

  // Usage: pages metered against the plan limit; the rest are real this-month
  // engagement counts (limit: null → shown as a plain count, not a fake cap).
  const usage = {
    pages: { label: 'Published Listings', current: pageCount, limit: pageLimit },
    offers: { label: 'Total Offers', current: offerCount, limit: null },
    aiOptimizations: { label: 'Agent visits (mo)', current: getAgentPageVisitCount(events), limit: null },
    simulations: { label: 'Discovery clicks (mo)', current: getDiscoveryClickCount(events), limit: null },
    impressions: { label: 'Conversions (mo)', current: getConversionCount(events), limit: null },
  }

  // Real Stripe invoices for Billing History (replaces the hardcoded placeholders).
  let invoices: Array<{ id: string; date: string; description: string; amount: number; status: 'paid' | 'pending' | 'failed'; hostedUrl: string | null }> = []
  if (billingState?.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const list = await stripe.invoices.list({ customer: billingState.stripe_customer_id, limit: 12 })
      invoices = list.data.map((inv) => ({
        id: inv.number || inv.id || 'invoice',
        date: new Date((inv.created ?? 0) * 1000).toISOString().slice(0, 10),
        description: inv.lines?.data?.[0]?.description || (activePlan ? `${activePlan.name} plan` : 'Subscription'),
        amount: Math.round(inv.amount_paid ?? inv.total ?? 0) / 100,
        status: inv.status === 'paid' ? 'paid' : inv.status === 'open' ? 'pending' : inv.status === 'void' || inv.status === 'uncollectible' ? 'failed' : 'pending',
        hostedUrl: inv.hosted_invoice_url || null,
      }))
    } catch (e) {
      console.warn('[billing] Stripe invoice fetch failed (non-fatal)', e)
    }
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Top header (consistent with platform) */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--signal)]">
              <span className="inline-block size-1.5 rounded-full bg-[var(--signal-solid)]" />
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

        {/* Trial / paused lifecycle banners (Shopify-style) */}
        {trialState.isTrialing && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-4 py-3 text-sm">
            <span className="text-white">
              <span className="font-semibold">{trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left</span> in your {trialPlanName} trial — add a payment method to keep your storefront live after it ends.
            </span>
            <a href={`?plan=${trialState.chosenPlanId}`} className="rounded-xl bg-[var(--signal-solid)] px-4 py-1.5 font-medium text-white">
              Add payment method
            </a>
          </div>
        )}
        {trialState.isPaused && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-4 py-3 text-sm">
            <span className="text-white">
              <span className="font-semibold">Your storefront is paused.</span> Your trial ended — choose a plan to bring your listings back online.
            </span>
            <a href={`?plan=${trialState.chosenPlanId ?? 'pro'}`} className="rounded-xl bg-[var(--amber)] px-4 py-1.5 font-medium text-zinc-950">
              Choose a plan to go live
            </a>
          </div>
        )}

        {/* The entire new tabbed glassmorphic experience */}
        <BillingDashboardClient
          activePlan={activePlan}
          billingState={billingState}
          usage={usage}
          invoices={invoices}
          platformFeesCents={platformFeesCents}
          agentRevenueCents={agentRevenueCents}
          revenueCurrency={revenueCurrency}
          commissionPct={commissionPct}
          stripeReady={stripeReady}
          configuredPlanIds={configuredPlanIds}
          initialPlanId={initialPlanFromQuery}
          connectSuccess={connectSuccess}
        />
      </div>
    </main>
  )
}
