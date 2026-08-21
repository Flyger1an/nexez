import { describe, expect, it } from 'vitest'
import {
  getNegotiationQueueState,
  negotiationMatchesQueueFilter,
  parseNegotiationRollup,
} from '../negotiation-report'

const NOW = Date.UTC(2026, 7, 21, 18, 0, 0)
const row = (overrides: Record<string, unknown> = {}) => ({
  status: 'negotiation',
  settlement_state: null,
  decision_pending: false,
  metadata: {},
  updated_at: new Date(NOW - 60_000).toISOString(),
  ...overrides,
})

describe('negotiation queue state', () => {
  it('prioritizes money and approval exceptions', () => {
    expect(getNegotiationQueueState(row({ status: 'disputed' }) as never, NOW)).toMatchObject({ key: 'dispute', priority: 100, urgent: true })
    expect(getNegotiationQueueState(row({ status: 'held', updated_at: new Date(NOW - 49 * 60 * 60 * 1000).toISOString() }) as never, NOW)).toMatchObject({ key: 'funds', urgent: true })
    expect(getNegotiationQueueState(row({ status: 'agreement_proposed', settlement_state: 'awaiting_approval' }) as never, NOW)).toMatchObject({ key: 'approval', ownerAction: true })
  })

  it('does not ask the seller to accept an agreement twice', () => {
    expect(getNegotiationQueueState(row({ status: 'agreement_proposed', settlement_state: 'approved' }) as never, NOW)).toMatchObject({ key: 'buyer', label: 'Waiting for buyer payment' })
  })

  it('distinguishes a buyer wait from a fresh proposal', () => {
    expect(getNegotiationQueueState(row({ metadata: { last_decision: { action: 'counter' } } }) as never, NOW).key).toBe('buyer')
    expect(getNegotiationQueueState(row() as never, NOW).key).toBe('review')
  })

  it('filters queue categories consistently', () => {
    const proposal = row()
    const waiting = row({ metadata: { last_decision: { action: 'clarify' } } })
    const closed = row({ status: 'complete' })
    expect(negotiationMatchesQueueFilter(proposal as never, 'needs_action', NOW)).toBe(true)
    expect(negotiationMatchesQueueFilter(waiting as never, 'waiting', NOW)).toBe(true)
    expect(negotiationMatchesQueueFilter(closed as never, 'closed', NOW)).toBe(true)
  })
})

describe('negotiation rollup parser', () => {
  it('normalizes numeric JSON and rejects unsupported versions', () => {
    const parsed = parseNegotiationRollup({
      schemaVersion: 1,
      counts: { total: '8', needsAction: 3 },
      backlog: { pending: 2, oldestPendingAt: '2026-08-21T17:00:00Z' },
      latency: { samples: 4, p50Ms: 1200, p95Ms: 8000, maxMs: 9000 },
      currencies: [{ currency: 'USD', agreedCount: 3, agreedCents: 10000 }],
      decisions: [{ action: 'accept', count: 2 }],
      daily: [{ date: '2026-08-21', created: 1 }],
      topOffers: [{ pageId: 'p1', slug: 'demo', offerKey: 'services-0', offerName: 'Audit', proposals: 3 }],
    })
    expect(parsed?.counts.total).toBe(8)
    expect(parsed?.currencies[0]).toMatchObject({ currency: 'usd', agreedCents: 10000 })
    expect(parsed?.topOffers[0]).toMatchObject({ offerName: 'Audit', agreements: 0 })
    expect(parseNegotiationRollup({ schemaVersion: 2 })).toBeNull()
  })
})
