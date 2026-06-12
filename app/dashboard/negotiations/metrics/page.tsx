import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowLeft, BarChart3, Clock, DollarSign, Gauge, Handshake, Hourglass } from 'lucide-react'
import { createClient } from '../../../../utils/supabase/server'
import { formatUsdCents } from '../../../../lib/checkout'
import { NEGOTIATION_STATUSES, getNegotiationStatusLabel } from '../../../../lib/negotiations'
import {
  computeNegotiationMetrics,
  DECISION_ACTIONS,
  type MetricsNegotiation,
  type MetricsMessage,
} from '../../../../lib/negotiation-metrics'
import { MetricsDonut, ThroughputChart } from './MetricsCharts'

// Bound the scan so the page stays fast for large accounts.
const MAX_NEGOTIATIONS = 500
const WINDOW_DAYS = 30

function msToHuman(ms: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 90) return `${s.toFixed(1)}s`
  const m = s / 60
  if (m < 90) return `${m.toFixed(0)}m`
  return `${(m / 60).toFixed(1)}h`
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400">
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl">
      <div className="mb-4 text-sm font-medium text-zinc-300">{title}</div>
      {children}
    </div>
  )
}

export default async function NegotiationMetricsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        <a href="/login?next=/dashboard/negotiations/metrics" className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950">
          Sign in to view negotiation metrics
        </a>
      </main>
    )
  }

  const { data: negotiationRows } = await supabase
    .from('agent_negotiations')
    .select('id, status, amount_cents, created_at, decision_pending, decision_requested_at, metadata')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(MAX_NEGOTIATIONS)
    .returns<Array<MetricsNegotiation & { id: string }>>()

  const negotiations = negotiationRows ?? []
  const ids = negotiations.map((n) => n.id)

  let messages: MetricsMessage[] = []
  if (ids.length) {
    const { data: messageRows } = await supabase
      .from('negotiation_messages')
      .select('negotiation_id, role, created_at')
      .in('negotiation_id', ids)
      .order('created_at', { ascending: true })
      .limit(5000)
      .returns<MetricsMessage[]>()
    messages = messageRows ?? []
  }

  const m = computeNegotiationMetrics(negotiations, messages, { days: WINDOW_DAYS })

  const statusData = NEGOTIATION_STATUSES.map((s) => ({ name: getNegotiationStatusLabel(s), value: m.statusCounts[s] }))
  const decisionData = DECISION_ACTIONS.map((a) => ({ name: a[0].toUpperCase() + a.slice(1), value: m.decisionCounts[a] || 0 }))

  return (
    <main className="min-h-screen bg-[#090b10] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/dashboard/negotiations" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" /> Back to inbox
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <BarChart3 className="size-7 text-[var(--signal)]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Negotiation Metrics</h1>
            <p className="text-sm text-zinc-400">Your last {Math.min(MAX_NEGOTIATIONS, m.total)} negotiations · throughput over {WINDOW_DAYS} days.</p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Handshake className="size-3.5" />} label="Total" value={String(m.total)} sub={`${m.statusCounts.negotiation} open · ${m.statusCounts.agreement_proposed} proposed`} />
          <StatCard icon={<DollarSign className="size-3.5" />} label="Agreed value" value={formatUsdCents(m.volume.agreedCents)} sub={`${m.volume.agreedCount} agreements · ${formatUsdCents(m.volume.completeCents)} completed`} />
          <StatCard icon={<Gauge className="size-3.5" />} label="Decision latency" value={msToHuman(m.latency.p50)} sub={`p50 · p95 ${msToHuman(m.latency.p95)} · ${m.latency.count} decisions`} />
          <StatCard
            icon={<Hourglass className="size-3.5" />}
            label="Pending backlog"
            value={String(m.backlog.pending)}
            sub={m.backlog.pending ? `oldest ${msToHuman(m.backlog.oldestPendingMs)} ago` : 'all decided'}
          />
        </div>

        {/* Charts */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard title="Status distribution">
            <MetricsDonut data={statusData} emptyLabel="No negotiations yet" />
          </ChartCard>
          <ChartCard title="Decision outcomes">
            <MetricsDonut data={decisionData} emptyLabel="No decisions yet" />
          </ChartCard>
          <ChartCard title="Held in escrow">
            <div className="flex h-48 flex-col items-center justify-center gap-1">
              <div className="text-3xl font-semibold text-[var(--ready)]">{formatUsdCents(m.volume.heldCents)}</div>
              <div className="text-xs text-zinc-500">{m.volume.heldCount} held · {m.statusCounts.disputed} disputed · {m.statusCounts.refunded} refunded</div>
            </div>
          </ChartCard>
        </div>

        <div className="mt-6">
          <ChartCard title={`Negotiations per day (last ${WINDOW_DAYS} days)`}>
            <ThroughputChart data={m.throughput} />
          </ChartCard>
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-zinc-600">
          <Clock className="size-3" /> Latency is the time from a buyer proposal to the engine&apos;s decision.
        </div>
      </div>
    </main>
  )
}
