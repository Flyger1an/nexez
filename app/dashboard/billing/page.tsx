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

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex justify-end">
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
              <p className="mt-1 text-[#9CA3AF]">Tracked in <a href="/dashboard/analytics" className="underline">Analytics</a>.</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">15% agent-sourced Stripe revenue.</p>
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

            <div className={`card !p-5 ${stripeProductionReady ? 'border-emerald-300/20 bg-emerald-300/10' : 'border-amber-200/20 bg-amber-200/10'}`}>
              <div className="flex items-center gap-2">
                <BadgeCheck className={`size-5 ${stripeProductionReady ? 'text-emerald-300' : 'text-amber-200'}`} />
                <p className="font-semibold">{stripeProductionReady ? 'Stripe production ready' : stripeReady ? 'Stripe checkout partial' : 'Stripe setup pending'}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {stripeProductionReady
                  ? 'Subscription checkout, customer tracking, and webhook sync are active.'
                  : stripeReady
                    ? 'Checkout can start, but webhooks or some plan Price IDs still need production setup.'
                    : 'Add STRIPE_SECRET_KEY and plan Price IDs to activate subscription checkout.'}
              </p>
              {!stripeProductionReady ? (
                <p className="mt-2 break-words text-[10px] leading-5 text-zinc-500">
                  Missing: {[
                    !stripeReadiness.secretKeyConfigured ? 'STRIPE_SECRET_KEY' : '',
                    !stripeReadiness.webhookSecretConfigured ? 'STRIPE_WEBHOOK_SECRET' : '',
                    !stripeReadiness.serviceRoleConfigured ? 'SUPABASE_SERVICE_ROLE_KEY' : '',
                    ...stripeReadiness.missingPlanEnvVars,
                  ].filter(Boolean).join(', ')}
                </p>
              ) : null}
            </div>

            <div className="card !p-5 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Subscription</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-white">{activePlan?.name ?? 'No active plan'}</span>
                <span className={`rounded-full border px-2 py-1 text-xs ${
                  status.tone === 'ok'
                    ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
                    : status.tone === 'warn'
                      ? 'border-amber-200/30 bg-amber-200/10 text-amber-100'
                      : 'border-white/10 bg-white/[0.04] text-zinc-400'
                }`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                {periodEnd
                  ? `${billingState?.cancel_at_period_end ? 'Access ends' : 'Renews'} ${periodEnd}.`
                  : 'Subscribe through Stripe to activate plan tracking.'}
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
            <p className="text-[10px] text-zinc-500">Stripe-hosted billing.</p>

            {search.setup === 'stripe' ? (
              <div className="rounded-lg border border-amber-200/20 bg-amber-200/10 p-4 text-sm text-amber-100">
                Stripe env vars needed.
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
