import { cookies } from 'next/headers'
import { Wallet, Lock, TrendingUp, ArrowDownToLine, Coins, Receipt, ArrowUpRight } from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import { createClient } from '../../../utils/supabase/server'
import { getOwnerPlanId } from '../../../lib/server/plan'
import { planAllows, getBillingPlan } from '../../../lib/billing'
import { clampHistoryRange, analyticsRangeBounds } from '../../../lib/analytics'
import { CheckoutEvent } from '../../../lib/checkout-events'
import {
  rollupFinanceByCurrency,
  getDailyRevenueSeries,
  getTopOffersByRevenueCents,
  getCurrencyOptions,
} from '../../../lib/finance-analytics'
import { formatCurrencyAmount, normalizeCurrency } from '../../../lib/currency'
import { getCommissionPercentForPlan, billingStatusCopy, type BillingSubscription } from '../../../lib/stripe-billing'
import { getConnectPayoutSnapshot } from '../../../lib/server/connect-finance'
import { GlassCard } from '../../../components/billing/billing-ui'
import { ProBadge } from '../../../components/billing/PlanGate'
import { appUrl } from '../../../lib/site'
import { RevenueChart } from './RevenueChart'

type FinanceProps = {
  searchParams: Promise<{ range?: string; from?: string; to?: string; currency?: string }>
}

const RANGES = [
  { label: 'Today', value: 'today' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: 'all' },
]

export default async function FinancePage({ searchParams }: FinanceProps) {
  const filters = await searchParams
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        <a href="/login?next=/dashboard/finance" className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950">
          Sign in to view finances
        </a>
      </main>
    )
  }

  // analyticsHistory (Pro): All-time + custom ranges are Pro; clamp server-side.
  const planId = await getOwnerPlanId(supabase, user.id)
  const fullHistory = planAllows(planId, 'analyticsHistory')
  const historyWindow = clampHistoryRange({ range: filters.range, from: filters.from, to: filters.to }, fullHistory)
  const range = historyWindow.range || '30d'
  const { cutoff, until } = analyticsRangeBounds(historyWindow)

  // Revenue events in-window.
  let eventsQuery = supabase
    .from('checkout_events')
    .select('*')
    .eq('owner_id', user.id)
    .gte('created_at', cutoff.toISOString())
  if (until) eventsQuery = eventsQuery.lte('created_at', until.toISOString())
  const { data: eventRows } = await eventsQuery.order('created_at', { ascending: false }).limit(1000).returns<CheckoutEvent[]>()
  const events = eventRows ?? []

  // Billing + Connect (the seller's own subscription + payout account).
  const { data: billing } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle<BillingSubscription>()
  const activePlan = getBillingPlan(planId)
  const commissionPct = getCommissionPercentForPlan(planId)
  const connectAccountId = billing?.stripe_connect_account_id ?? null
  const payoutsReady = Boolean(billing?.stripe_connect_payouts_enabled)
  const payouts = await getConnectPayoutSnapshot(connectAccountId)

  // Escrow currently held, per currency (negotiation settlement layer).
  const { data: negRows } = await supabase
    .from('agent_negotiations')
    .select('status, amount_cents, currency')
    .eq('owner_id', user.id)
    .returns<Array<{ status: string; amount_cents: number | null; currency: string | null }>>()
  const heldByCurrency = new Map<string, number>()
  for (const n of negRows ?? []) {
    if (n.status !== 'held' || !n.amount_cents) continue
    const code = normalizeCurrency(n.currency)
    heldByCurrency.set(code, (heldByCurrency.get(code) ?? 0) + n.amount_cents)
  }

  // Per-currency roll-up + the selected currency for the hero/trend/top-offers.
  const byCurrency = rollupFinanceByCurrency(events, commissionPct)
  const currencyOptions = getCurrencyOptions(events)
  const requested = filters.currency ? normalizeCurrency(filters.currency) : null
  const selectedCurrency = requested && currencyOptions.includes(requested) ? requested : currencyOptions[0] ?? 'usd'
  const sel =
    byCurrency.find((r) => r.currency === selectedCurrency) ??
    { currency: selectedCurrency, gmvCents: 0, orders: 0, nexezFeeCents: 0, netCents: 0, aovCents: 0 }
  const heldSel = heldByCurrency.get(selectedCurrency) ?? 0

  // Trend window: a readable recent span keyed off the selected range (the KPI/
  // table figures still cover the full window; the chart shows the recent trend).
  const seriesDays = range === '7d' || range === '1d' || range === 'today' ? 7 : 30
  const trend = getDailyRevenueSeries(events, seriesDays, selectedCurrency)
  const topOffers = getTopOffersByRevenueCents(events, selectedCurrency).slice(0, 6)
  const money = (cents: number) => formatCurrencyAmount(cents, selectedCurrency)

  const href = (next: { range?: string; currency?: string }) => {
    const params = new URLSearchParams()
    const r = next.range ?? range
    const c = next.currency ?? selectedCurrency
    if (r && r !== '30d') params.set('range', r)
    if (c && c !== 'usd') params.set('currency', c)
    const qs = params.toString()
    return `/dashboard/finance${qs ? `?${qs}` : ''}`
  }

  const hasRevenue = byCurrency.length > 0

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <ErrorBoundary>
        <div className="mx-auto max-w-7xl px-6 py-10">
          {/* Header */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="flex items-center gap-2 text-sm text-[var(--signal)]">
                <Wallet className="size-4" /> Finance
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">Money in &amp; out</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Real agent-driven sales, what you keep after the {commissionPct}% platform fee, payouts to your bank, and
                escrow held — separate from your own Nexez subscription.
              </p>
            </div>
            <a
              href="/dashboard/billing"
              className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/10 sm:self-auto"
            >
              <Receipt className="size-4" /> Your plan &amp; invoices
            </a>
          </div>

          {/* Controls: time window + currency */}
          <div className="mt-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs uppercase tracking-[0.18em] text-zinc-500">Window</span>
              {RANGES.map((r) => {
                if (r.value === 'all' && !fullHistory) {
                  return (
                    <a
                      key={r.value}
                      href={appUrl('/dashboard/billing?plan=pro')}
                      title="All-time history is on the Pro plan"
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--signal)]/30 bg-[var(--signal)]/[0.06] px-3 py-1.5 text-sm text-zinc-400 hover:bg-[var(--signal)]/15"
                    >
                      <Lock className="size-3.5 text-[var(--signal)]" /> All
                    </a>
                  )
                }
                return (
                  <a
                    key={r.value}
                    href={href({ range: r.value })}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      range === r.value ? 'border-white bg-white text-black' : 'border-white/10 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {r.label}
                  </a>
                )
              })}
              {!fullHistory && <ProBadge feature="analyticsHistory" />}
            </div>
            {currencyOptions.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs uppercase tracking-[0.18em] text-zinc-500">Currency</span>
                {currencyOptions.map((c) => (
                  <a
                    key={c}
                    href={href({ currency: c })}
                    className={`rounded-md border px-3 py-1.5 text-sm uppercase transition ${
                      selectedCurrency === c ? 'border-white bg-white text-black' : 'border-white/10 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {c}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Hero KPIs (selected currency) */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiTile label="Sales volume (GMV)" value={money(sel.gmvCents)} sub={`${sel.orders} order${sel.orders === 1 ? '' : 's'}`} icon={<TrendingUp className="size-4" />} />
            <KpiTile label="Net to you" value={money(sel.netCents)} sub={`after ${commissionPct}% fee`} icon={<Coins className="size-4" />} tone="ready" />
            <KpiTile label="Nexez commission" value={money(sel.nexezFeeCents)} sub={`${commissionPct}% take-rate`} icon={<Receipt className="size-4" />} />
            <KpiTile label="Avg order value" value={money(sel.aovCents)} sub={`${selectedCurrency.toUpperCase()}`} icon={<ArrowUpRight className="size-4" />} />
            <KpiTile label="Escrow held" value={money(heldSel)} sub="pending settlement" icon={<Lock className="size-4" />} tone="amber" />
          </div>

          {/* Revenue trend */}
          <GlassCard className="mt-6 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="size-4 text-[var(--ready)]" /> Revenue over time
                <span className="text-sm font-normal text-zinc-500">· {selectedCurrency.toUpperCase()}</span>
              </h2>
            </div>
            {hasRevenue ? (
              <RevenueChart data={trend} currency={selectedCurrency} />
            ) : (
              <EmptyFinance payoutsReady={payoutsReady} connectAccountId={connectAccountId} />
            )}
          </GlassCard>

          {/* Payouts + per-currency + top offers */}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
            {/* Payouts */}
            <GlassCard className="p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ArrowDownToLine className="size-4 text-[var(--signal)]" /> Payouts to your bank
              </h2>
              {!connectAccountId ? (
                <div className="mt-4 rounded-xl border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] p-4 text-sm text-zinc-300">
                  <p className="font-medium text-white">Connect Stripe to get paid</p>
                  <p className="mt-1 text-zinc-400">
                    Agents pay you directly; Nexez takes {commissionPct}% as a fee. You need a connected account to accept
                    card payments and receive payouts.
                  </p>
                  <a href="/dashboard/billing?tab=fees" className="btn-primary btn-sm mt-3 inline-flex">Set up payouts</a>
                </div>
              ) : !payouts ? (
                <p className="mt-4 text-sm text-zinc-400">
                  {payoutsReady ? 'Payout details are syncing from Stripe — refresh shortly.' : 'Finish Stripe verification to enable payouts.'}
                  <a href="/dashboard/billing?tab=fees" className="ml-2 text-[var(--signal)] hover:underline">Manage</a>
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Balance label="Available" lines={payouts.available} />
                    <Balance label="Pending" lines={payouts.pending} />
                  </div>
                  <div className="border-t border-white/10 pt-3">
                    <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Recent payouts</p>
                    {payouts.payouts.length ? (
                      <ul className="space-y-1.5 text-sm">
                        {payouts.payouts.slice(0, 5).map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3">
                            <span className="text-zinc-300">{formatCurrencyAmount(p.amountCents, p.currency)}</span>
                            <span className="flex items-center gap-2 text-xs text-zinc-500">
                              {p.arrivalDate ? new Date(p.arrivalDate * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                              <PayoutStatus status={p.status} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-zinc-500">No payouts yet — they’ll appear here once you make sales.</p>
                    )}
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Per-currency breakdown */}
            <GlassCard className="p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Coins className="size-4 text-[var(--ready)]" /> By currency
              </h2>
              {byCurrency.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="py-2 font-medium">Currency</th>
                        <th className="py-2 text-right font-medium">GMV</th>
                        <th className="py-2 text-right font-medium">Fee</th>
                        <th className="py-2 text-right font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCurrency.map((r) => (
                        <tr key={r.currency} className={`border-t border-white/10 ${r.currency === selectedCurrency ? 'text-white' : 'text-zinc-300'}`}>
                          <td className="py-2.5 font-medium uppercase">{r.currency}</td>
                          <td className="py-2.5 text-right">{formatCurrencyAmount(r.gmvCents, r.currency)}</td>
                          <td className="py-2.5 text-right text-zinc-400">{formatCurrencyAmount(r.nexezFeeCents, r.currency)}</td>
                          <td className="py-2.5 text-right text-[var(--ready)]">{formatCurrencyAmount(r.netCents, r.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[11px] text-zinc-500">Each currency is shown on its own — totals are never mixed across currencies.</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">No sales in this window yet.</p>
              )}
            </GlassCard>
          </div>

          {/* Top offers by revenue */}
          <GlassCard className="mt-6 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ArrowUpRight className="size-4 text-[var(--signal)]" /> Top offers by revenue
              <span className="text-sm font-normal text-zinc-500">· {selectedCurrency.toUpperCase()}</span>
            </h2>
            {topOffers.length ? (
              <ul className="mt-4 space-y-2">
                {topOffers.map((o, i) => (
                  <li key={`${o.pageSlug}-${o.offerKey}`} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-xs text-zinc-500">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{o.name}</p>
                        <p className="truncate font-mono text-xs text-zinc-500">/{o.pageSlug}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[var(--ready)]">{money(o.revenueCents)}</p>
                      <p className="text-xs text-zinc-500">{o.orders} order{o.orders === 1 ? '' : 's'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">No offer revenue in this window yet.</p>
            )}
          </GlassCard>

          {/* Your subscription (cost, separated from earnings) */}
          <GlassCard className="mt-6 p-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Receipt className="size-4 text-zinc-400" /> Your Nexez subscription
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  What you pay Nexez (separate from your earnings above). You’re on{' '}
                  <span className="font-medium text-white">{activePlan?.name ?? 'Free'}</span>
                  {activePlan?.cadence ? ` · ${activePlan.price}/${activePlan.cadence}` : ''} ·{' '}
                  {commissionPct}% per-sale fee
                  {billing?.status ? ` · ${billingStatusCopy(billing.status).label}` : ''}.
                </p>
              </div>
              <a href="/dashboard/billing" className="btn-primary btn-sm inline-flex shrink-0">Manage plan</a>
            </div>
          </GlassCard>

          <p className="mt-6 text-center text-[11px] text-zinc-600">
            GMV reflects checkout sessions started via Nexez. Commission is estimated at your current {commissionPct}% rate.
            Refunds/disputes shown for escrow agreements. Figures are not a substitute for your Stripe dashboard.
          </p>
        </div>
      </ErrorBoundary>
    </main>
  )
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  tone?: 'ready' | 'amber'
}) {
  const valueClass = tone === 'ready' ? 'text-[var(--ready)]' : tone === 'amber' ? 'text-[var(--amber)]' : 'text-white'
  return (
    <GlassCard className="p-5">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </p>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </GlassCard>
  )
}

function Balance({ label, lines }: { label: string; lines: { amountCents: number; currency: string }[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{label}</p>
      {lines.length ? (
        lines.map((l) => (
          <p key={l.currency} className="mt-1 text-lg font-semibold">
            {formatCurrencyAmount(l.amountCents, l.currency)}
          </p>
        ))
      ) : (
        <p className="mt-1 text-lg font-semibold text-zinc-500">—</p>
      )}
    </div>
  )
}

function PayoutStatus({ status }: { status: string }) {
  const ok = status === 'paid'
  const warn = status === 'failed' || status === 'canceled'
  const cls = ok
    ? 'bg-[var(--ready)]/15 text-[var(--ready)]'
    : warn
      ? 'bg-[var(--amber)]/15 text-[var(--amber)]'
      : 'bg-white/10 text-zinc-300'
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cls}`}>{status.replace('_', ' ')}</span>
}

function EmptyFinance({ payoutsReady, connectAccountId }: { payoutsReady: boolean; connectAccountId: string | null }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
      <Wallet className="mx-auto size-8 text-zinc-600" />
      <p className="mt-3 font-medium">No sales yet in this window</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
        When agents buy through your pages, your revenue, fees, and payouts show up here.
        {!connectAccountId ? ' First, connect Stripe so you can accept payments.' : !payoutsReady ? ' Finish Stripe verification to enable payouts.' : ''}
      </p>
      <div className="mt-4 flex justify-center gap-3">
        {!connectAccountId && (
          <a href="/dashboard/billing?tab=fees" className="btn-primary btn-sm inline-flex">Connect Stripe</a>
        )}
        <a href="/dashboard/pages" className="inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          View your pages
        </a>
      </div>
    </div>
  )
}
