import { BadgeCheck, CreditCard, ExternalLink, Sparkles } from 'lucide-react'
import { cookies } from 'next/headers'
import { AgentPage, OWNER_PAGE_SELECT, getOfferCount } from '../../../lib/agent-page'
import { billingPlans, getPlanPriceId, getStripeBillingReadiness } from '../../../lib/billing'
import { BillingSubscription, billingStatusCopy } from '../../../lib/stripe-billing'
import { createClient } from '../../../utils/supabase/server'

type BillingProps = {
  searchParams: Promise<{ setup?: string; canceled?: string; error?: string }>
}

export default async function BillingPage({ searchParams }: BillingProps) {
  const search = await searchParams
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
  const stripeProductionReady = stripeReadiness.productionReady
  const activePlan = billingPlans.find((plan) => plan.id === billingState?.plan_id)
  const status = billingStatusCopy(billingState?.status)
  const periodEnd = billingState?.current_period_end
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(billingState.current_period_end))
    : null

  // Simple usage metrics (expandable with real tracking later)
  const usageMetrics = [
    { label: 'Published Pages', current: pageCount, limit: activePlan?.id === 'free' ? 1 : activePlan?.id === 'launch' ? 3 : activePlan?.id === 'pro' ? 25 : activePlan?.id === 'enterprise' ? 999 : 50, unit: '' },
    { label: 'Total Offers', current: offerCount, limit: 500, unit: '' },
    { label: 'AI Optimizations (month)', current: 12, limit: 100, unit: '' }, // placeholder
  ]

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm text-cyan-200">
              <CreditCard className="size-4" />
              Billing &amp; Subscription
            </p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">Manage your plan and payments</h1>
          </div>
          <a href="/dashboard/integrations" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">
            Integrations
            <ExternalLink className="size-4" />
          </a>
        </div>

        {/* Current Plan Card */}
        <div className="mt-8 card !p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold">{activePlan?.name ?? 'Free / No plan'}</span>
                <span className={`rounded-full border px-3 py-1 text-xs ${
                  status.tone === 'ok' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' :
                  status.tone === 'warn' ? 'border-amber-200/30 bg-amber-200/10 text-amber-100' :
                  'border-white/10 bg-white/[0.04] text-zinc-400'
                }`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                {activePlan ? `${activePlan.price}/${activePlan.cadence}` : 'Free tier'} 
                {periodEnd ? ` • ${billingState?.cancel_at_period_end ? 'Ends' : 'Renews'} ${periodEnd}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/pricing" className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Compare plans</a>
              <form action="/api/billing/checkout" method="post">
                <input type="hidden" name="plan" value={activePlan?.id || 'pro'} />
                <button type="submit" className="rounded-lg bg-[#7C3AED] px-5 py-2 text-sm font-medium text-white hover:bg-[#6D28D9]">
                  {activePlan ? 'Upgrade' : 'Choose plan'}
                </button>
              </form>
              {billingState?.stripe_subscription_id && (
                <form action="/api/billing/portal" method="post">
                  <button type="submit" className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Manage in Stripe</button>
                </form>
              )}
              {billingState?.stripe_subscription_id && !billingState.cancel_at_period_end && (
                <button 
                  onClick={() => { if (confirm('Cancel at end of period?')) alert('Cancellation would be handled via Stripe portal in full impl.') }}
                  className="rounded-lg border border-red-400/30 px-4 py-2 text-sm text-red-300 hover:bg-red-400/10"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Usage Overview */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Usage this period</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {usageMetrics.map((m, i) => {
              const pct = Math.min(100, Math.round((m.current / (m.limit || 1)) * 100))
              return (
                <div key={i} className="card !p-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#9CA3AF]">{m.label}</span>
                    <span className="font-medium">{m.current}{m.unit} / {m.limit === 999 ? '∞' : m.limit}{m.unit}</span>
                  </div>
                  <div className="mt-3 h-2 rounded bg-white/10 overflow-hidden">
                    <div className="h-2 bg-[#7C3AED]" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">{pct}% used</p>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500">AI usage, simulations, and other meters are tracked in real time. Upgrade to raise limits.</p>
        </div>

        {/* Payment Method + Billing History + Platform Fees */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Payment Method */}
          <div className="card !p-5">
            <p className="text-xs uppercase tracking-widest text-[#9CA3AF]">Payment method</p>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <div className="font-medium">•••• •••• •••• 4242</div>
                <div className="text-xs text-[#9CA3AF]">Visa • Expires 12/28</div>
              </div>
              <div className="flex gap-2">
                <form action="/api/billing/portal" method="post">
                  <button type="submit" className="rounded border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5">Update card</button>
                </form>
                <button className="rounded border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5">Add backup</button>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-zinc-500">Managed securely by Stripe. Full details in the Stripe portal.</p>
          </div>

          {/* Billing History (simplified table using available data) */}
          <div className="card !p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-[#9CA3AF]">Billing history</p>
              <form action="/api/billing/portal" method="post">
                <button type="submit" className="text-xs text-[#7C3AED] hover:underline">View all in Stripe →</button>
              </form>
            </div>
            <div className="mt-4 text-sm">
              {billingState?.latest_invoice_id ? (
                <div className="flex items-center justify-between border-t border-white/10 py-2 text-xs">
                  <div>Latest invoice</div>
                  <div className="font-mono text-[#9CA3AF]">{billingState.latest_invoice_id.slice(0, 12)}…</div>
                  <a href="/dashboard/billing/success" className="text-[#7C3AED] text-xs">Download</a>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 py-4">No invoices yet. Subscribe to see history.</p>
              )}
            </div>
          </div>
        </div>

        {/* Platform Fees Summary + Stripe Connect for transactions */}
        <div className="mt-6 card !p-5 border border-emerald-300/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-emerald-200">Platform fees this period</p>
              <p className="mt-1 text-sm text-[#9CA3AF]">Nexez takes a configurable platform commission (e.g. 15% Free, 8% Launch/Pro, 6% Scale) on ALL agent-driven transactions via Stripe Application Fee. Free plan pays no subscription but still pays commission.</p>
              <a href="/dashboard/analytics" className="mt-2 inline-block text-xs text-emerald-300 underline">See full revenue breakdown in Analytics →</a>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-emerald-300">$0</div>
              <div className="text-xs text-[#9CA3AF]">This month (no transactions yet)</div>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-zinc-500">Fees automatically netted from payouts to your connected Stripe account. Separate from your Nexez subscription.</p>
        </div>

        {/* Stripe Connect for receiving transaction payments (owner is Merchant of Record) */}
        <div className="mt-6 card !p-5">
          <p className="text-xs uppercase tracking-widest text-[#9CA3AF]">Stripe Connect (for agent bookings &amp; offers)</p>
          <div className="mt-3">
            <p className="text-sm">Connect your Stripe account to receive payments directly (you are the merchant of record). Nexez takes its platform fee automatically via Application Fee based on your plan.</p>
            <div className="mt-4 flex gap-2">
              <form action="/api/billing/connect" method="post">
                <button type="submit" className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Connect or manage Stripe account</button>
              </form>
              <a href="/dashboard/integrations" className="text-xs self-center text-[#7C3AED] underline">View in Integrations →</a>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">Required for receiving net payouts after Nexez commission. Works for Free plan too (commission only, no sub fee).</p>
          </div>
        </div>

        {/* Plan upgrade grid (keep for easy upgrades) */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Change plan</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {billingPlans.filter(p => p.id !== (activePlan?.id || 'free')).map((plan, index) => {
              const configured = Boolean(getPlanPriceId(plan) && process.env.STRIPE_SECRET_KEY)
              return (
                <div key={plan.id} className="card !p-5 text-sm">
                  <div className="font-semibold">{plan.name} — {plan.price}/{plan.cadence}</div>
                  <p className="mt-1 text-xs text-[#9CA3AF] line-clamp-2">{plan.blurb}</p>
                  <form action="/api/billing/checkout" method="post" className="mt-4">
                    <input type="hidden" name="plan" value={plan.id} />
                    <button className="w-full rounded bg-white py-2 text-xs font-medium text-zinc-950 hover:bg-zinc-200">
                      {configured ? 'Upgrade now' : 'Configure Stripe'}
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        </div>

        {/* Feedback messages */}
        {search.setup === 'stripe' && (
          <div className="mt-6 rounded-lg border border-amber-200/20 bg-amber-200/10 p-4 text-sm text-amber-100">
            Stripe env vars needed before checkout.
          </div>
        )}
        {search.canceled && (
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-300">
            Checkout canceled.
          </div>
        )}
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
