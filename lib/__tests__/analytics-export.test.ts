import { describe, expect, it } from 'vitest'
import { buildComprehensiveAnalyticsCsv } from '../analytics-export'
import { escapeAnalyticsCsvValue } from '../analytics'
import type { CheckoutEvent } from '../checkout-events'

describe('analytics export', () => {
  it('neutralizes spreadsheet formulas from user-controlled fields', () => {
    expect(escapeAnalyticsCsvValue('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"')
    expect(escapeAnalyticsCsvValue('+cmd')).toBe("'+cmd")
    expect(escapeAnalyticsCsvValue('normal')).toBe('normal')
  })

  it('exports activity, traffic, and paid orders under one stable schema', () => {
    const event = {
      id: 'event-1', page_id: 'page-1', owner_id: 'owner-1', slug: 'acme', offer_key: 'services-0',
      offer_name: '=unsafe', offer_kind: 'services', event_type: 'checkout_attempt', agent_user_agent: 'GPTBot',
      referrer: null, query: 'strategy', checkout_url: null, provider_url: null, stripe_session_id: null,
      metadata: { amount_cents: 1000, currency: 'USD' }, trust_level: 'verified_server', ingestion_source: 'checkout',
      created_at: '2026-08-21T10:00:00Z',
    } satisfies CheckoutEvent
    const csv = buildComprehensiveAnalyticsCsv({
      events: [event],
      visits: [{
        id: 'visit-1', page_id: 'page-1', owner_id: 'owner-1', slug: 'acme', path: '/acme', referrer: null,
        query: null, user_agent: 'GPTBot', ip_hash: null, is_ai_agent: true, agent_type: 'ChatGPT-Agent',
        confidence_score: 99, detection_signals: {}, trust_level: 'verified_server', ingestion_source: 'page',
        created_at: '2026-08-21T09:00:00Z',
      }],
      orders: [{
        id: 'order-1', status: 'paid', channel: 'acp', amount_cents: 1000, currency: 'usd', stripe_livemode: true,
        created_at: '2026-08-21T11:00:00Z', slug: 'acme', offer_name: 'Strategy', buyer_agent: 'ChatGPT',
      }],
    })

    expect(csv.split('\n')).toHaveLength(4)
    expect(csv).toContain('activity_event')
    expect(csv).toContain('traffic_visit')
    expect(csv).toContain('paid_order')
    expect(csv).toContain("'=unsafe")
    expect(csv).toContain(',ACP,usd,1000')
  })
})
