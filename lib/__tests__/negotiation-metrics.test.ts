import { describe, it, expect } from 'vitest'
import { computeNegotiationMetrics, percentile } from '../negotiation-metrics'

const NOW = Date.UTC(2026, 5, 11, 12, 0, 0) // fixed noon UTC for determinism
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const neg = (over: any = {}) => ({ status: 'negotiation', amount_cents: null, created_at: iso(NOW), ...over })

describe('percentile (nearest-rank)', () => {
  it('handles empty, single, and ranked arrays', () => {
    expect(percentile([], 50)).toBe(0)
    expect(percentile([5], 50)).toBe(5)
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
  })
})

describe('computeNegotiationMetrics', () => {
  it('counts statuses and latest-decision actions', () => {
    const negs = [
      neg({ status: 'negotiation', metadata: { last_decision: { action: 'counter' } } }),
      neg({ status: 'agreement_proposed', amount_cents: 90000, metadata: { last_decision: { action: 'accept' } } }),
      neg({ status: 'declined', metadata: { last_decision: { action: 'reject' } } }),
      neg({ status: 'complete', amount_cents: 50000, metadata: { last_decision: { action: 'accept' } } }),
    ]
    const m = computeNegotiationMetrics(negs, [], { now: NOW })
    expect(m.total).toBe(4)
    expect(m.statusCounts.negotiation).toBe(1)
    expect(m.statusCounts.agreement_proposed).toBe(1)
    expect(m.statusCounts.complete).toBe(1)
    expect(m.decisionCounts.accept).toBe(2)
    expect(m.decisionCounts.counter).toBe(1)
    expect(m.decisionCounts.reject).toBe(1)
  })

  it('sums agreement/escrow volume over the right statuses only', () => {
    const negs = [
      neg({ status: 'agreement_proposed', amount_cents: 90000 }),
      neg({ status: 'held', amount_cents: 120000 }),
      neg({ status: 'complete', amount_cents: 50000 }),
      neg({ status: 'declined', amount_cents: 999 }), // excluded from volume
    ]
    const m = computeNegotiationMetrics(negs, [], { now: NOW })
    expect(m.volume.agreedCents).toBe(90000 + 120000 + 50000)
    expect(m.volume.heldCents).toBe(120000)
    expect(m.volume.completeCents).toBe(50000)
    expect(m.volume.agreedCount).toBe(3)
  })

  it('computes decision latency from buyer→seller pairs and ignores unpaired turns', () => {
    const msgs = [
      { negotiation_id: 'A', role: 'buyer', created_at: iso(NOW) },
      { negotiation_id: 'A', role: 'seller_llm', created_at: iso(NOW + 2000) }, // 2000ms
      { negotiation_id: 'B', role: 'buyer', created_at: iso(NOW) },
      { negotiation_id: 'B', role: 'seller_llm', created_at: iso(NOW + 6000) }, // 6000ms
      { negotiation_id: 'C', role: 'buyer', created_at: iso(NOW) }, // unpaired → ignored
    ]
    const m = computeNegotiationMetrics([], msgs, { now: NOW })
    expect(m.latency.count).toBe(2)
    expect(m.latency.p50).toBe(2000)
    expect(m.latency.max).toBe(6000)
  })

  it('buckets throughput per UTC day, zero-filled to the window length', () => {
    const negs = [
      neg({ created_at: iso(NOW) }),
      neg({ created_at: iso(NOW) }),
      neg({ created_at: iso(NOW - 2 * DAY) }),
      neg({ created_at: iso(NOW - 60 * DAY) }), // outside the 30-day window
    ]
    const m = computeNegotiationMetrics(negs, [], { now: NOW, days: 30 })
    expect(m.throughput).toHaveLength(30)
    expect(m.throughput[m.throughput.length - 1].count).toBe(2) // today
    expect(m.throughput.find((p) => p.date === iso(NOW - 2 * DAY).slice(0, 10))?.count).toBe(1)
  })

  it('reports pending backlog count + oldest pending age', () => {
    const negs = [
      neg({ decision_pending: true, decision_requested_at: iso(NOW - 5 * 60_000) }),
      neg({ decision_pending: true, decision_requested_at: iso(NOW - 20 * 60_000) }),
      neg({ decision_pending: false }),
    ]
    const m = computeNegotiationMetrics(negs, [], { now: NOW })
    expect(m.backlog.pending).toBe(2)
    expect(m.backlog.oldestPendingMs).toBe(20 * 60_000)
  })

  it('is safe on empty input', () => {
    const m = computeNegotiationMetrics([], [], { now: NOW })
    expect(m.total).toBe(0)
    expect(m.latency.p50).toBe(0)
    expect(m.volume.agreedCents).toBe(0)
    expect(m.backlog.pending).toBe(0)
    expect(m.throughput).toHaveLength(30)
  })
})
