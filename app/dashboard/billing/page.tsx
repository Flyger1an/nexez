import { BadgeCheck, CreditCard, ExternalLink, Sparkles } from 'lucide-react'
import { cookies } from 'next/headers'
import { AgentPage, OWNER_PAGE_SELECT, getOfferCount } from '../../../lib/agent-page'
import { billingPlans, getPlanPriceId, getStripeBillingReadiness } from '../../../lib/billing'
import { BillingSubscription, billingStatusCopy } from '../../../lib/stripe-billing'
import { createClient } from '../../../utils/supabase/server'

// Client components for interactive parts (to avoid putting client-only code/event handlers in Server Components).
import EmbeddedPlanSelector from '../../../components/billing/EmbeddedPlanSelector'
import StripeConnectButton from '../../../components/billing/StripeConnectButton'
import RefreshConnectButton from '../../../components/billing/RefreshConnectButton'
import { AutoRefreshConnect } from '../../../components/billing/AutoRefreshConnect'

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
  const stripeProductionReady = stripeReadiness.productionReady
  const activePlan = billingPlans.find((plan) => plan.id === billingState?.plan_id)
  const status = billingStatusCopy(billingState?.status)
  const periodEnd = billingState?.current_period_end ? (() => {
    try {
      const d = new Date(billingState.current_period_end)
      if (isNaN(d.getTime())) return null
      return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
    } catch {
      return null
    }
  })() : null

  // Simple usage metrics (expandable with real tracking later)
  const usageMetrics = [
    { label: 'Published Pages', current: pageCount, limit: activePlan?.id === 'free' ? 1 : activePlan?.id === 'launch' ? 3 : activePlan?.id === 'pro' ? 25 : activePlan?.id === 'enterprise' ? 999 : 50, unit: '' },
    { label: 'Total Offers', current: offerCount, limit: 500, unit: '' },
    { label: 'AI Optimizations (month)', current: 12, limit: 100, unit: '' }, // placeholder
  ]

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Top nav / header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-cyan-200">
              <CreditCard className="size-4" />
              Billing
            </div>
            <h1 className="mt-1 text-4xl font-semibold tracking-[-1.5px]">Your plan &amp; payouts</h1>
          </div>
          <a href="/pricing" className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Compare plans</a>
        </div>

        {/* Auto refresh helper (invisible) */}
        <AutoRefreshConnect connectSuccess={connectSuccess} />

        {/* Success / feedback banners - clean and prominent when needed */}
        {connectSuccess && (
          <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            Stripe Connect updated. Your payouts status has been refreshed.
          </div>
        )}
        {search.setup === 'stripe' && (
          <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Stripe is not fully configured. Add your keys in Vercel to enable subscriptions and payouts.
          </div>
        )}
        {search.error === 'bad_price_id' && (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            One of your STRIPE_PRICE_* env vars is set to a Product ID (prod_...) instead of a Price ID (price_...). Fix it and redeploy.
          </div>
        )}

        {/* Current Plan — Hero style, straight to the point (Vercel/xAI inspired) */}
        <div className="rounded-3xl border border-white/10 bg-[#111113] p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-semibold tracking-[-1px]">{activePlan?.name ?? 'Free'}</span>
                <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${
                  status.tone === 'ok' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' :
                  status.tone === 'warn' ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' :
                  'border-white/15 bg-white/5 text-zinc-400'
                }`}>
                  {status.label}
                </span>
              </div>
              <div className="mt-1 text-2xl text-[#9CA3AF]">
                {activePlan ? `${activePlan.price}/${activePlan.cadence}` : 'No subscription'}
              </div>
              {periodEnd && (
                <p className="mt-2 text-sm text-[#9CA3AF]">
                  {billingState?.cancel_at_period_end ? 'Cancels' : 'Renews'} on {periodEnd}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a href="/pricing" className="rounded-2xl border border-white/15 px-5 py-2.5 text-sm hover:bg-white/5">Compare plans</a>

              {billingState?.stripe_subscription_id && (
                <form action="/api/billing/portal" method="post">
                  <button className="rounded-2xl border border-white/15 px-5 py-2.5 text-sm hover:bg-white/5">Manage subscription</button>
                </form>
              )}

              <form action="/api/billing/checkout" method="post">
                <input type="hidden" name="plan" value={activePlan?.id || 'pro'} />
                <button className="rounded-2xl bg-[#7C3AED] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#6D28D9]">
                  {activePlan ? 'Upgrade' : 'Choose plan'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Usage + Revenue side-by-side — clean and modern (Grok/Vercel feel) */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Usage */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wider text-[#9CA3AF] uppercase">Usage this month</h3>
              <span className="text-xs text-[#9CA3AF]">Resets with your billing cycle</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {usageMetrics.map((m, i) => {
                const pct = Math.min(100, Math.round((m.current / (m.limit || 1)) * 100))
                return (
                  <div key={i} className="rounded-2xl border border-white/10 bg-[#111113] p-5">
                    <div className="text-sm text-[#9CA3AF]">{m.label}</div>
                    <div className="mt-3 text-3xl font-semibold tracking-tighter">
                      {m.current}<span className="text-base font-normal text-[#9CA3AF]"> / {m.limit === 999 ? '∞' : m.limit}</span>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded bg-white/10">
                      <div className="h-1.5 bg-[#7C3AED] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[10px] text-[#9CA3AF]">{pct}% used</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Revenue & Payouts (Connect side) */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wider text-[#9CA3AF] uppercase">Revenue &amp; payouts</h3>
              <a href="/dashboard/analytics" className="text-xs text-[#7C3AED] hover:underline">See analytics →</a>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111113] p-5">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="text-[#9CA3AF]">Platform fees this month</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tighter text-emerald-300">$0</div>
                </div>
                <div className="text-right text-xs text-[#9CA3AF]">
                  15% on Free<br />8% on Launch/Pro<br />6% on Scale+
                </div>
              </div>

              <div className="my-5 border-t border-white/10" />

              {/* Stripe Connect status */}
              <div>
                <div className="text-sm text-[#9CA3AF] mb-2">Your Stripe account (for payouts)</div>

                {billingState?.stripe_connect_account_id ? (
                  <div>
                    <div className="font-mono text-xs text-[#9CA3AF]">{billingState.stripe_connect_account_id}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className={`rounded px-2 py-0.5 ${billingState.stripe_connect_details_submitted ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
                        {billingState.stripe_connect_details_submitted ? 'Details submitted' : 'Details pending'}
                      </span>
                      <span className={`rounded px-2 py-0.5 ${billingState.stripe_connect_charges_enabled ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
                        {billingState.stripe_connect_charges_enabled ? 'Charges enabled' : 'Charges pending'}
                      </span>
                      <span className={`rounded px-2 py-0.5 ${billingState.stripe_connect_payouts_enabled ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
                        {billingState.stripe_connect_payouts_enabled ? 'Payouts enabled' : 'Payouts pending'}
                      </span>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <StripeConnectButton isConnected />
                      <RefreshConnectButton />
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-[#9CA3AF]">Connect your Stripe account to receive earnings directly (you keep the rest after our small platform fee).</p>
                    <div className="mt-3">
                      <StripeConnectButton />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Billing details — consolidated and minimal */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#111113] p-5">
            <div className="text-sm font-semibold tracking-wider text-[#9CA3AF] uppercase mb-3">Payment method</div>
            <div className="text-sm">Managed securely in Stripe.</div>
            <div className="mt-3">
              <form action="/api/billing/portal" method="post">
                <button className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Update payment method →</button>
              </form>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111113] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold tracking-wider text-[#9CA3AF] uppercase">Billing history</div>
              <form action="/api/billing/portal" method="post">
                <button className="text-sm text-[#7C3AED] hover:underline">View all invoices →</button>
              </form>
            </div>
            {billingState?.latest_invoice_id ? (
              <div className="text-sm">Latest invoice available in Stripe portal.</div>
            ) : (
              <div className="text-sm text-[#9CA3AF]">No invoices yet.</div>
            )}
          </div>
        </div>

        {/* Plans — clean and prominent (moved up in visual weight) */}
        <div className="mt-10">
          <EmbeddedPlanSelector
            activePlanId={activePlan?.id || 'free'}
            stripeReady={stripeReady}
            initialPlanId={initialPlanFromQuery}
          />
        </div>
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

