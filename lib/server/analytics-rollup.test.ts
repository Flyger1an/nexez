import { describe, expect, it, vi } from 'vitest'
import { loadOwnerAnalyticsRollup } from './analytics-rollup'

describe('loadOwnerAnalyticsRollup', () => {
  it('normalizes Postgres JSON counts and computes trust coverage', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        schemaVersion: 1,
        counts: {
          events: 7,
          visits: '5',
          aiVisits: 3,
          humanVisits: 2,
          discoveryClicks: 1,
          checkoutAttempts: 4,
          checkoutHandoffs: 2,
          checkoutStarts: 2,
          paidOrders: 2,
          paidDirectOrders: 1,
          retainedDirectOrders: 1,
          negotiations: 3,
          openNegotiations: 2,
          completedNegotiations: 1,
        },
        trust: {
          events: { total: 7, verified: 6, legacy: 1, unverified: 0 },
          visits: { total: 5, verified: 4, legacy: 0, unverified: 1 },
        },
        daily: [{ date: '2026-08-21T00:00:00+00:00', eventSignals: 7, visits: 5, aiVisits: 3, discoveryClicks: 1, checkoutStarts: 2, paidOrders: 2 }],
        channels: [{ channel: 'agent_checkout', orders: 1 }, { channel: 'acp', orders: 1 }],
        currencies: [{ currency: 'usd', orders: 2, gmvCents: 20000, refundedCents: 0, feeCents: 1200 }],
        agentTypes: [{ agentType: 'ChatGPT-Agent', visits: 3, avgConfidence: 96.4 }],
        topPages: [{ pageId: 'page-1', slug: 'acme', name: 'Acme', visits: 3 }],
        topOffers: [{ pageId: 'page-1', slug: 'acme', offerKey: 'services-0', offerName: 'Consulting', signals: 7, attempts: 4, paidOrders: 1 }],
        topQueries: [{ query: 'consulting', uses: 3 }],
        topReferrers: [{ referrer: 'https://chatgpt.com', visits: 2 }],
        activePageIds: ['page-1'],
      },
      error: null,
    })

    const result = await loadOwnerAnalyticsRollup({ rpc }, {
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-21T23:59:59Z'),
      pageId: 'page-1',
      query: 'consulting',
      eventType: 'all',
      traffic: 'ai',
    })

    expect(result.error).toBeNull()
    expect(result.data?.counts.visits).toBe(5)
    expect(result.data?.counts.checkoutHandoffs).toBe(2)
    expect(result.data?.trust.events.verifiedPercent).toBe(86)
    expect(result.data?.trust.visits.verifiedPercent).toBe(80)
    expect(result.data?.agentTypes[0]).toEqual({ agentType: 'ChatGPT-Agent', visits: 3, avgConfidence: 96 })
    expect(result.data?.topOffers[0].paidOrders).toBe(1)
    expect(result.data?.activePageIds).toEqual(['page-1'])
    expect(rpc).toHaveBeenCalledWith('nz_owner_analytics_rollup', expect.objectContaining({
      p_page_id: 'page-1',
      p_query: 'consulting',
      p_event_type: null,
      p_traffic: 'ai',
    }))
  })

  it('fails closed on unknown schemas and preserves RPC errors', async () => {
    const invalid = await loadOwnerAnalyticsRollup({
      rpc: vi.fn().mockResolvedValue({ data: { schemaVersion: 2 }, error: null }),
    }, { from: new Date('2026-08-01T00:00:00Z') })
    expect(invalid.data).toBeNull()
    expect(invalid.error).toBeInstanceOf(Error)

    const dbError = { code: '42501', message: 'denied' }
    const denied = await loadOwnerAnalyticsRollup({
      rpc: vi.fn().mockResolvedValue({ data: null, error: dbError }),
    }, { from: new Date('2026-08-01T00:00:00Z') })
    expect(denied).toEqual({ data: null, error: dbError })
  })
})
