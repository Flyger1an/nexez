import Link from 'next/link'
import { cookies } from 'next/headers'
import { AlertTriangle, ArrowLeft, BarChart3, Clock, DollarSign, Gauge, Handshake, Hourglass } from 'lucide-react'
import { createClient } from '../../../../utils/supabase/server'
import { formatCurrencyAmount } from '../../../../lib/currency'
import { NEGOTIATION_STATUSES, getNegotiationStatusLabel } from '../../../../lib/negotiations'
import { computeNegotiationMetrics, DECISION_ACTIONS, type MetricsNegotiation, type MetricsMessage } from '../../../../lib/negotiation-metrics'
import { loadNegotiationRollup, type NegotiationRollup } from '../../../../lib/negotiation-report'
import { MetricsDonut, ThroughputChart } from './MetricsCharts'
import { DataLoadNotice } from '../../../../components/dashboard/DataLoadNotice'

const FALLBACK_NEGOTIATIONS = 500
const WINDOW_DAYS = 30

type FallbackNegotiation = MetricsNegotiation & {
  id: string
  currency: string | null
  refunded_cents: number | null
}

function msToHuman(ms: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 90) return `${seconds.toFixed(1)}s`
  const minutes = seconds / 60
  if (minutes < 90) return `${minutes.toFixed(0)}m`
  return `${(minutes / 60).toFixed(1)}h`
}

function ageFrom(value: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? Math.max(0, Date.now() - time) : 0
}

function actionLabel(action: string) {
  return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ')
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400">{icon} {label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl">
      <h2 className="mb-4 text-sm font-medium text-zinc-300">{title}</h2>
      {children}
    </section>
  )
}

function fallbackCurrencies(rows: FallbackNegotiation[]): NegotiationRollup['currencies'] {
  const totals = new Map<string, NegotiationRollup['currencies'][number]>()
  for (const row of rows) {
    const currency = (row.currency || 'usd').toLowerCase()
    const current = totals.get(currency) ?? {
      currency,
      agreedCount: 0,
      agreedCents: 0,
      heldCount: 0,
      heldCents: 0,
      capturedCount: 0,
      capturedCents: 0,
      refundedCents: 0,
    }
    const amount = Math.max(0, Number(row.amount_cents) || 0)
    if (['agreement_proposed', 'held', 'complete', 'refunded', 'disputed'].includes(row.status) && amount) {
      current.agreedCount += 1
      current.agreedCents += amount
    }
    if (row.status === 'held' && amount) {
      current.heldCount += 1
      current.heldCents += amount
    }
    if (['complete', 'refunded', 'disputed'].includes(row.status) && amount) {
      current.capturedCount += 1
      current.capturedCents += amount
    }
    current.refundedCents += row.status === 'disputed'
      ? amount
      : Math.min(amount, Math.max(0, Number(row.refunded_cents) || (row.status === 'refunded' ? amount : 0)))
    totals.set(currency, current)
  }
  return [...totals.values()].sort((a, b) => b.capturedCents - a.capturedCents || a.currency.localeCompare(b.currency))
}

export default async function NegotiationMetricsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        <a href="/login?next=/dashboard/negotiations/metrics" className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950">Sign in to view negotiation metrics</a>
      </main>
    )
  }

  const [rollupResult, negotiationResult] = await Promise.all([
    loadNegotiationRollup(supabase),
    supabase
      .from('agent_negotiations')
      .select('id, status, amount_cents, currency, refunded_cents, created_at, decision_pending, decision_requested_at, metadata')
      .eq('owner_id', user.id)
      .or('stripe_livemode.is.null,stripe_livemode.eq.true')
      .order('created_at', { ascending: false })
      .limit(FALLBACK_NEGOTIATIONS)
      .returns<FallbackNegotiation[]>(),
  ])

  const negotiations = negotiationResult.data ?? []
  let messages: MetricsMessage[] = []
  let messageError: unknown = null
  if (!rollupResult.data && negotiations.length) {
    const result = await supabase
      .from('negotiation_messages')
      .select('negotiation_id, role, created_at')
      .in('negotiation_id', negotiations.map((row) => row.id))
      .order('created_at', { ascending: true })
      .limit(5000)
      .returns<MetricsMessage[]>()
    messages = result.data ?? []
    messageError = result.error
  }

  const exact = rollupResult.data
  const fallback = computeNegotiationMetrics(negotiations, messages, { days: WINDOW_DAYS })
  const statusCounts = exact?.counts ?? fallback.statusCounts
  const total = exact?.counts.total ?? fallback.total
  const pending = exact?.backlog.pending ?? fallback.backlog.pending
  const oldestPendingMs = exact ? ageFrom(exact.backlog.oldestPendingAt) : fallback.backlog.oldestPendingMs
  const latency = exact?.latency
    ? { p50: exact.latency.p50Ms, p95: exact.latency.p95Ms, count: exact.latency.samples }
    : fallback.latency
  const currencies = exact?.currencies ?? fallbackCurrencies(negotiations)
  const decisions = exact?.decisions ?? DECISION_ACTIONS.map((action) => ({ action, count: fallback.decisionCounts[action] || 0 }))
  const throughput = exact?.daily ?? fallback.throughput.map((row) => ({ date: row.date, created: row.count, agreed: 0, captured: 0 }))
  const dataIssues = [
    rollupResult.error ? 'exact negotiation reporting (showing a recent sample)' : null,
    negotiationResult.error && !exact ? 'recent negotiation fallback' : null,
    messageError && !exact ? 'decision latency fallback' : null,
  ].filter((issue): issue is string => Boolean(issue))
  const statusData = NEGOTIATION_STATUSES.map((status) => ({ name: getNegotiationStatusLabel(status), value: Number(statusCounts[status] ?? 0) }))
  const decisionData = decisions.map((row) => ({ name: actionLabel(row.action), value: row.count }))
  const primaryCurrency = currencies[0]

  return (
    <main className="min-h-screen bg-[#090b10] px-4 py-8 text-white md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/dashboard/negotiations" className="mb-6 inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" /> Back to decision queue
        </Link>
        <header className="mb-8 flex items-start gap-3">
          <BarChart3 className="mt-0.5 size-7 text-[var(--signal)]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Negotiation performance</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">Exact lifecycle totals, decision responsiveness, and currency-safe agreement value. Throughput covers the last {WINDOW_DAYS} days.</p>
          </div>
        </header>
        <DataLoadNotice issues={dataIssues} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Handshake className="size-3.5" />} label="All negotiations" value={String(total)} sub={exact ? `${exact.counts.needsAction} need action · ${exact.counts.waiting} waiting` : `latest ${Math.min(FALLBACK_NEGOTIATIONS, total)} sampled`} />
          <StatCard icon={<DollarSign className="size-3.5" />} label="Agreement value" value={primaryCurrency ? formatCurrencyAmount(primaryCurrency.agreedCents, primaryCurrency.currency) : '—'} sub={primaryCurrency ? `${primaryCurrency.agreedCount} agreements · ${currencies.length} ${currencies.length === 1 ? 'currency' : 'currencies'}` : 'no priced agreements'} />
          <StatCard icon={<Gauge className="size-3.5" />} label="Decision latency" value={msToHuman(latency.p50)} sub={`p50 · p95 ${msToHuman(latency.p95)} · ${latency.count} paired turns`} />
          <StatCard icon={<Hourglass className="size-3.5" />} label="Decision worker" value={String(pending)} sub={pending ? `oldest pending ${msToHuman(oldestPendingMs)}` : 'no decisions pending'} />
        </div>

        {exact ? (
          <section className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-3">
            <OperationalStat label="Needs seller action" value={exact.counts.needsAction} tone={exact.counts.needsAction ? 'attention' : 'ready'} />
            <OperationalStat label="Stale open deals" value={exact.counts.staleOpen} tone={exact.counts.staleOpen ? 'attention' : 'ready'} />
            <OperationalStat label="Open disputes" value={exact.counts.disputed} tone={exact.counts.disputed ? 'danger' : 'ready'} />
          </section>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Lifecycle distribution"><MetricsDonut data={statusData} emptyLabel="No negotiations yet" /></ChartCard>
          <ChartCard title="Decision outcomes"><MetricsDonut data={decisionData} emptyLabel="No decisions yet" /></ChartCard>
        </div>
        <div className="mt-6"><ChartCard title={`Proposal cohorts · last ${WINDOW_DAYS} days`}><ThroughputChart data={throughput} /></ChartCard></div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-medium text-zinc-300">Agreement value by currency</h2><span className="text-xs text-zinc-500">Currencies are never combined</span></div>
          {currencies.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {currencies.map((row) => (
                <div key={row.currency} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between"><span className="font-mono text-xs uppercase text-zinc-500">{row.currency}</span><span className="text-xs text-zinc-500">{row.agreedCount} agreements</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <MoneyStat label="Agreed" cents={row.agreedCents} currency={row.currency} />
                    <MoneyStat label="Held" cents={row.heldCents} currency={row.currency} />
                    <MoneyStat label="Captured" cents={row.capturedCents} currency={row.currency} />
                    <MoneyStat label="Returned/disputed" cents={row.refundedCents} currency={row.currency} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-zinc-500">No priced agreements yet.</p>}
        </section>

        {exact?.topOffers.length ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-medium text-zinc-300">Offer negotiation health</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500"><tr><th className="pb-3 font-medium">Offer</th><th className="pb-3 font-medium">Proposals</th><th className="pb-3 font-medium">Agreements</th><th className="pb-3 font-medium">Captured</th><th className="pb-3 font-medium">Agreement rate</th></tr></thead>
                <tbody className="divide-y divide-white/10">
                  {exact.topOffers.map((offer) => (
                    <tr key={`${offer.pageId}:${offer.offerKey}`}>
                      <td className="py-3"><div className="font-medium text-zinc-200">{offer.offerName}</div><div className="text-xs text-zinc-500">/{offer.slug}</div></td>
                      <td className="py-3 text-zinc-300">{offer.proposals}</td><td className="py-3 text-zinc-300">{offer.agreements}</td><td className="py-3 text-zinc-300">{offer.captured}</td>
                      <td className="py-3 text-zinc-300">{offer.proposals ? `${((offer.agreements / offer.proposals) * 100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="mt-6 flex items-start gap-2 text-xs leading-5 text-zinc-500"><Clock className="mt-0.5 size-3 shrink-0" /> Decision latency pairs each buyer turn with the immediately following owner or Nexez response. Cohort outcomes reflect the current state of proposals created on each day. Agreement and captured amounts remain separated by settlement currency.</div>
      </div>
    </main>
  )
}

function OperationalStat({ label, value, tone }: { label: string; value: number; tone: 'ready' | 'attention' | 'danger' }) {
  const color = tone === 'ready' ? 'text-[var(--ready)]' : tone === 'danger' ? 'text-red-300' : 'text-[var(--amber)]'
  return <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><AlertTriangle className={`size-4 ${color}`} /><div><div className={`text-xl font-semibold ${color}`}>{value}</div><div className="text-xs text-zinc-500">{label}</div></div></div>
}

function MoneyStat({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return <div><div className="text-xs text-zinc-500">{label}</div><div className="mt-0.5 font-medium text-zinc-200">{formatCurrencyAmount(cents, currency)}</div></div>
}
