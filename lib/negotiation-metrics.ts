import { NEGOTIATION_STATUSES, NegotiationStatus } from './negotiations'

/**
 * Pure aggregation for the negotiation metrics dashboard (Burst 3c). Given the
 * owner's negotiation rows + their message turns, computes the funnel, decision
 * mix, async decision latency (the buyer-turn → seller-turn gap), escrow value,
 * throughput, and pending backlog. No I/O — the caller fetches the rows (RLS
 * owner-scoped on the server) and the dashboard renders the result.
 */

export type MetricsNegotiation = {
  status: string
  amount_cents: number | null
  created_at: string
  decision_pending?: boolean | null
  decision_requested_at?: string | null
  metadata?: { last_decision?: { action?: string } | null } | null
}

export type MetricsMessage = {
  negotiation_id: string
  role: string
  created_at: string
}

export type DailyPoint = { date: string; count: number }

export type NegotiationMetrics = {
  total: number
  statusCounts: Record<NegotiationStatus, number>
  decisionCounts: Record<string, number>
  latency: { p50: number; p95: number; max: number; count: number } // milliseconds
  volume: {
    agreedCents: number
    heldCents: number
    completeCents: number
    agreedCount: number
    heldCount: number
    completeCount: number
  }
  throughput: DailyPoint[]
  backlog: { pending: number; oldestPendingMs: number }
}

export const DECISION_ACTIONS = ['accept', 'counter', 'reject', 'clarify', 'review'] as const

const DAY_MS = 86_400_000

/** Nearest-rank percentile of an ascending-sorted array (ms). 0 for empty input. */
export function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))]
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function computeNegotiationMetrics(
  negotiations: MetricsNegotiation[],
  messages: MetricsMessage[],
  opts: { now?: number; days?: number } = {},
): NegotiationMetrics {
  // Default the clock here (not in the RSC caller) so the component body stays pure.
  const now = opts.now ?? Date.now()
  const days = opts.days ?? 30

  const statusCounts = Object.fromEntries(NEGOTIATION_STATUSES.map((s) => [s, 0])) as Record<NegotiationStatus, number>
  const decisionCounts: Record<string, number> = Object.fromEntries(DECISION_ACTIONS.map((a) => [a, 0]))

  let agreedCents = 0
  let heldCents = 0
  let completeCents = 0
  let agreedCount = 0
  let heldCount = 0
  let completeCount = 0
  let pending = 0
  let oldestPendingTs = Infinity

  for (const n of negotiations) {
    if ((NEGOTIATION_STATUSES as readonly string[]).includes(n.status)) {
      statusCounts[n.status as NegotiationStatus] += 1
    }
    const action = n.metadata?.last_decision?.action
    if (action && action in decisionCounts) decisionCounts[action] += 1

    const cents = n.amount_cents || 0
    if (n.status === 'agreement_proposed' || n.status === 'held' || n.status === 'complete') {
      agreedCents += cents
      agreedCount += 1
    }
    if (n.status === 'held') {
      heldCents += cents
      heldCount += 1
    }
    if (n.status === 'complete') {
      completeCents += cents
      completeCount += 1
    }

    if (n.decision_pending) {
      pending += 1
      if (n.decision_requested_at) {
        const ts = new Date(n.decision_requested_at).getTime()
        if (!Number.isNaN(ts) && ts < oldestPendingTs) oldestPendingTs = ts
      }
    }
  }

  // Decision latency: per negotiation, pair each buyer turn with the NEXT seller_llm
  // turn (a buyer turn with another buyer before any seller is left unpaired).
  const byNeg = new Map<string, MetricsMessage[]>()
  for (const m of messages) {
    const arr = byNeg.get(m.negotiation_id)
    if (arr) arr.push(m)
    else byNeg.set(m.negotiation_id, [m])
  }
  const latencies: number[] = []
  for (const turns of byNeg.values()) {
    const sorted = [...turns].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].role !== 'buyer') continue
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].role === 'seller_llm') {
          const dt = new Date(sorted[j].created_at).getTime() - new Date(sorted[i].created_at).getTime()
          if (Number.isFinite(dt) && dt >= 0) latencies.push(dt)
          break
        }
        if (sorted[j].role === 'buyer') break // unpaired buyer
      }
    }
  }
  latencies.sort((a, b) => a - b)

  // Throughput: negotiations created per UTC day over the window (zero-filled).
  const buckets = new Map<string, number>()
  const startTs = now - days * DAY_MS
  for (const n of negotiations) {
    const ts = new Date(n.created_at).getTime()
    if (Number.isNaN(ts) || ts < startTs) continue
    const key = ymd(ts)
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  const throughput: DailyPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const key = ymd(now - i * DAY_MS)
    throughput.push({ date: key, count: buckets.get(key) || 0 })
  }

  return {
    total: negotiations.length,
    statusCounts,
    decisionCounts,
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? latencies[latencies.length - 1] : 0,
      count: latencies.length,
    },
    volume: { agreedCents, heldCents, completeCents, agreedCount, heldCount, completeCount },
    throughput,
    backlog: { pending, oldestPendingMs: oldestPendingTs === Infinity ? 0 : Math.max(0, now - oldestPendingTs) },
  }
}
