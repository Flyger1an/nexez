import type { AgentNegotiation } from './negotiations'

export type NegotiationRollup = {
  schemaVersion: 1
  counts: {
    total: number
    negotiation: number
    agreement_proposed: number
    paused: number
    open: number
    proposed: number
    held: number
    complete: number
    declined: number
    expired: number
    refunded: number
    disputed: number
    decisionPending: number
    needsAction: number
    waiting: number
    staleOpen: number
  }
  backlog: { pending: number; oldestPendingAt: string | null }
  latency: { samples: number; p50Ms: number; p95Ms: number; maxMs: number }
  currencies: Array<{
    currency: string
    agreedCount: number
    agreedCents: number
    heldCount: number
    heldCents: number
    capturedCount: number
    capturedCents: number
    refundedCents: number
  }>
  decisions: Array<{ action: string; count: number }>
  daily: Array<{ date: string; created: number; agreed: number; captured: number }>
  topOffers: Array<{
    pageId: string
    slug: string
    offerKey: string
    offerName: string
    proposals: number
    agreements: number
    captured: number
  }>
}

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

export type NegotiationQueueFilter = 'all' | 'needs_action' | 'waiting' | 'closed'
export type NegotiationQueueState = {
  key: 'review' | 'approval' | 'funds' | 'dispute' | 'paused' | 'processing' | 'buyer' | 'closed'
  label: string
  detail: string
  ownerAction: boolean
  urgent: boolean
  priority: number
}

const CLOSED = new Set(['complete', 'declined', 'expired', 'refunded'])
const STALE_MS = 72 * 60 * 60 * 1000
const HELD_URGENT_MS = 48 * 60 * 60 * 1000

function nonNegativeInt(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function rows<T>(value: unknown, parse: (row: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((value) => {
    const parsed = parse(object(value))
    return parsed ? [parsed] : []
  })
}

export function parseNegotiationRollup(value: unknown): NegotiationRollup | null {
  const raw = object(value)
  if (Number(raw.schemaVersion) !== 1) return null
  const counts = object(raw.counts)
  const backlog = object(raw.backlog)
  const latency = object(raw.latency)

  return {
    schemaVersion: 1,
    counts: {
      total: nonNegativeInt(counts.total),
      negotiation: nonNegativeInt(counts.negotiation),
      agreement_proposed: nonNegativeInt(counts.agreement_proposed),
      paused: nonNegativeInt(counts.paused),
      open: nonNegativeInt(counts.open),
      proposed: nonNegativeInt(counts.proposed),
      held: nonNegativeInt(counts.held),
      complete: nonNegativeInt(counts.complete),
      declined: nonNegativeInt(counts.declined),
      expired: nonNegativeInt(counts.expired),
      refunded: nonNegativeInt(counts.refunded),
      disputed: nonNegativeInt(counts.disputed),
      decisionPending: nonNegativeInt(counts.decisionPending),
      needsAction: nonNegativeInt(counts.needsAction),
      waiting: nonNegativeInt(counts.waiting),
      staleOpen: nonNegativeInt(counts.staleOpen),
    },
    backlog: {
      pending: nonNegativeInt(backlog.pending),
      oldestPendingAt: typeof backlog.oldestPendingAt === 'string' ? backlog.oldestPendingAt : null,
    },
    latency: {
      samples: nonNegativeInt(latency.samples),
      p50Ms: nonNegativeInt(latency.p50Ms),
      p95Ms: nonNegativeInt(latency.p95Ms),
      maxMs: nonNegativeInt(latency.maxMs),
    },
    currencies: rows(raw.currencies, (row) => typeof row.currency === 'string' ? {
      currency: row.currency.toLowerCase(),
      agreedCount: nonNegativeInt(row.agreedCount),
      agreedCents: nonNegativeInt(row.agreedCents),
      heldCount: nonNegativeInt(row.heldCount),
      heldCents: nonNegativeInt(row.heldCents),
      capturedCount: nonNegativeInt(row.capturedCount),
      capturedCents: nonNegativeInt(row.capturedCents),
      refundedCents: nonNegativeInt(row.refundedCents),
    } : null),
    decisions: rows(raw.decisions, (row) => typeof row.action === 'string'
      ? { action: row.action, count: nonNegativeInt(row.count) }
      : null),
    daily: rows(raw.daily, (row) => typeof row.date === 'string' ? {
      date: row.date,
      created: nonNegativeInt(row.created),
      agreed: nonNegativeInt(row.agreed),
      captured: nonNegativeInt(row.captured),
    } : null),
    topOffers: rows(raw.topOffers, (row) =>
      typeof row.pageId === 'string' && typeof row.slug === 'string'
        && typeof row.offerKey === 'string' && typeof row.offerName === 'string'
        ? {
            pageId: row.pageId,
            slug: row.slug,
            offerKey: row.offerKey,
            offerName: row.offerName,
            proposals: nonNegativeInt(row.proposals),
            agreements: nonNegativeInt(row.agreements),
            captured: nonNegativeInt(row.captured),
          }
        : null),
  }
}

export async function loadNegotiationRollup(
  client: RpcClient,
  input: { from?: Date | null; to?: Date | null; pageId?: string | null; query?: string | null } = {},
) {
  const { data, error } = await client.rpc('nz_owner_negotiation_rollup', {
    p_from: input.from?.toISOString() ?? null,
    p_to: input.to?.toISOString() ?? null,
    p_page_id: input.pageId || null,
    p_query: input.query?.trim() || null,
  })
  if (error) return { data: null, error }
  const parsed = parseNegotiationRollup(data)
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: new Error('Negotiation reporting returned an unsupported shape.') }
}

function lastDecisionAction(metadata: AgentNegotiation['metadata']) {
  const decision = object(object(metadata).last_decision)
  return typeof decision.action === 'string' ? decision.action : ''
}

export function getNegotiationQueueState(
  negotiation: Pick<AgentNegotiation, 'status' | 'settlement_state' | 'decision_pending' | 'metadata' | 'updated_at'>,
  now = Date.now(),
): NegotiationQueueState {
  const updatedAt = new Date(negotiation.updated_at).getTime()
  const ageMs = Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : 0
  const stale = ageMs >= STALE_MS

  if (negotiation.status === 'disputed') {
    return { key: 'dispute', label: 'Review dispute', detail: 'A chargeback needs attention.', ownerAction: true, urgent: true, priority: 100 }
  }
  if (negotiation.status === 'held') {
    return {
      key: 'funds',
      label: 'Capture or release funds',
      detail: ageMs >= HELD_URGENT_MS ? 'The authorization has been held for more than 48 hours.' : 'The buyer funded this agreement.',
      ownerAction: true,
      urgent: ageMs >= HELD_URGENT_MS,
      priority: ageMs >= HELD_URGENT_MS ? 95 : 85,
    }
  }
  if (negotiation.status === 'agreement_proposed' && negotiation.settlement_state === 'awaiting_approval') {
    return { key: 'approval', label: 'Approve agreement', detail: 'Approval unlocks the buyer payment link.', ownerAction: true, urgent: stale, priority: stale ? 90 : 80 }
  }
  if (negotiation.status === 'paused') {
    return { key: 'paused', label: 'Resume or close', detail: 'This negotiation is paused.', ownerAction: true, urgent: stale, priority: stale ? 75 : 60 }
  }
  if (negotiation.decision_pending) {
    return { key: 'processing', label: 'Nexez is responding', detail: 'The decision worker is processing the latest buyer turn.', ownerAction: false, urgent: stale, priority: stale ? 70 : 35 }
  }
  if (negotiation.status === 'agreement_proposed') {
    return { key: 'buyer', label: 'Waiting for buyer payment', detail: 'The agreement is ready for the buyer.', ownerAction: false, urgent: stale, priority: stale ? 55 : 25 }
  }
  if (negotiation.status === 'negotiation' && ['counter', 'clarify'].includes(lastDecisionAction(negotiation.metadata))) {
    return { key: 'buyer', label: 'Waiting for buyer', detail: 'Your latest response is with the buyer.', ownerAction: false, urgent: stale, priority: stale ? 50 : 20 }
  }
  if (negotiation.status === 'negotiation') {
    return { key: 'review', label: 'Review proposal', detail: 'Accept, counter, clarify, pause, or decline.', ownerAction: true, urgent: stale, priority: stale ? 88 : 78 }
  }
  if (CLOSED.has(negotiation.status)) {
    return { key: 'closed', label: 'Closed', detail: 'No negotiation action is required.', ownerAction: false, urgent: false, priority: 0 }
  }
  return { key: 'closed', label: 'No action', detail: 'No seller action is currently available.', ownerAction: false, urgent: false, priority: 0 }
}

export function negotiationMatchesQueueFilter(
  negotiation: Pick<AgentNegotiation, 'status' | 'settlement_state' | 'decision_pending' | 'metadata' | 'updated_at'>,
  filter: NegotiationQueueFilter,
  now = Date.now(),
) {
  if (filter === 'all') return true
  const queue = getNegotiationQueueState(negotiation, now)
  if (filter === 'needs_action') return queue.ownerAction
  if (filter === 'waiting') return queue.key === 'buyer' || queue.key === 'processing'
  return queue.key === 'closed'
}
