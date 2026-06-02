import { ArrowLeft, BadgeCheck, CreditCard, ExternalLink, Sparkles } from 'lucide-react'
import { cookies } from 'next/headers'
import { AgentPage, OWNER_PAGE_SELECT, getOfferCount } from '../../../lib/agent-page'
import { billingPlans, getPlanPriceId, isStripeBillingConfigured } from '../../../lib/billing'
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

  const pageCount = pages?.length ?? 0
  const offerCount = pages?.reduce((sum, page) => sum + getOfferCount(page), 0) ?? 0
  const stripeReady = isStripeBillingConfigured()

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <a href="/dashboard/integrations" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">
            Integrations
            <ExternalLink className="size-4" />
          </a>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="space-y-5">
            <div>
              <p className="flex items-center gap-2 text-sm text-cyan-200">
                <CreditCard className="size-4" />
                Billing / Plans
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Choose the operating plan.</h1>
            </div>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1">
              <Stat label="Pages" value={String(pageCount)} />
              <Stat label="Listed offers" value={String(offerCount)} />
            </div>

            {/* Tier 3: Agent revenue share display (post-audit, using analytics lib) */}
            <div className="card !p-5 border border-emerald-300/20">
              <p className="font-medium text-emerald-200">Agent-driven revenue (Tier 3)</p>
              <p className="mt-1 text-[#9CA3AF]">Tracked in <a href="/dashboard/analytics" className="underline">Analytics</a> via checkout_events (agent UA/query/referrer).</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">Est. your share: 15% of agent-sourced Stripe revenue (configurable per plan). See full breakdown + pipeline in analytics for real calc from getAgentDrivenRevenueCents.</p>
            </div>

            {/* Heuristic plan status for lean MVP (based on published count) */}
            <div className="card !p-4 text-sm">
              <p className="font-medium text-cyan-200">Current usage vs plans</p>
              <p className="mt-2 text-zinc-300">
                {pageCount} published pages · {offerCount} total offers
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Launch: up to 3 pages &nbsp;•&nbsp; Pro: 25 pages &nbsp;•&nbsp; Scale: unlimited. Upgrade when you hit limits.
              </p>
            </div>

            <div className={`card !p-5 ${stripeReady ? 'border-emerald-300/20 bg-emerald-300/10' : 'border-amber-200/20 bg-amber-200/10'}`}>
              <div className="flex items-center gap-2">
                <BadgeCheck className={`size-5 ${stripeReady ? 'text-emerald-300' : 'text-amber-200'}`} />
                <p className="font-semibold">{stripeReady ? 'Stripe billing ready' : 'Stripe setup pending'}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {stripeReady
                  ? 'Subscription checkout is configured for at least one plan.'
                  : 'Add STRIPE_SECRET_KEY and plan Price IDs to activate subscription checkout.'}
              </p>
            </div>

            <form action="/api/billing/portal" method="post">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Manage subscription in Stripe portal
                <ExternalLink className="size-4" />
              </button>
            </form>
            <p className="text-[10px] text-zinc-500">Update payment method, change plan, or cancel anytime via Stripe.</p>

            {search.setup === 'stripe' ? (
              <div className="rounded-lg border border-amber-200/20 bg-amber-200/10 p-4 text-sm text-amber-100">
                Billing checkout needs Stripe env vars before it can start.
              </div>
            ) : null}
            {search.canceled ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-300">
                Checkout canceled.
              </div>
            ) : null}
          </aside>

          <section className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {billingPlans.map((plan, index) => {
              const configured = Boolean(getPlanPriceId(plan) && process.env.STRIPE_SECRET_KEY)
              return (
                <article
                  key={plan.id}
                  className={`flex min-h-[520px] flex-col rounded-lg border p-5 ${
                    index === 1
                      ? 'border-cyan-300/40 bg-cyan-300/10'
                      : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-2xl font-semibold">{plan.name}</h2>
                      {index === 1 ? (
                        <span className="rounded-full bg-cyan-300 px-3 py-1 text-xs font-semibold text-zinc-950">
                          MVP
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-zinc-400">{plan.blurb}</p>
                    <p className="mt-6">
                      <span className="text-5xl font-semibold tracking-tight">{plan.price}</span>
                      <span className="ml-2 text-zinc-500">/{plan.cadence}</span>
                    </p>
                  </div>

                  <ul className="mt-7 flex-1 space-y-3 text-sm text-zinc-300">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Sparkles className="size-4 text-cyan-200" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <form action="/api/billing/checkout" method="post" className="mt-7">
                    <input type="hidden" name="plan" value={plan.id} />
                    <button
                      className="inline-flex w-full items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
                    >
                      {configured ? 'Start checkout' : 'Configure Stripe'}
                    </button>
                  </form>
                  <p className="mt-3 font-mono text-xs text-zinc-600">{plan.envVar}</p>
                </article>
              )
            })}
          </section>
        </section>
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
