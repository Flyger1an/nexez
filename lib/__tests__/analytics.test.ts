import { describe, expect, it } from 'vitest'
import {
  filterAnalyticsEvents,
  getAgentPageVisitCount,
  getDailyEventSeries,
  getDiscoveryActionStats,
  getDiscoveryClickCount,
  getSignalLabel,
  getTopOfferStats,
  isLikelyAgentUserAgent,
} from '../analytics'
import { CheckoutEvent, getEventActionLabel } from '../checkout-events'

const discoveryEvent: CheckoutEvent = {
  id: 'evt-1',
  page_id: 'page-1',
  owner_id: 'owner-1',
  slug: 'acme',
  offer_key: 'services-0',
  offer_name: 'Strategy Session',
  offer_kind: 'services',
  event_type: 'directory_click',
  agent_user_agent: 'Mozilla/5.0',
  referrer: 'https://nexez.test/directory',
  query: 'strategy',
  checkout_url: 'https://nexez.test/acme',
  provider_url: null,
  stripe_session_id: null,
  metadata: {
    surface: 'directory',
    action: 'public_page',
  },
  created_at: new Date().toISOString(),
}

describe('analytics discovery events', () => {
  it('labels directory clicks as discovery signals', () => {
    expect(getEventActionLabel('directory_click')).toBe('Directory discovery click')
    expect(getSignalLabel(discoveryEvent)).toBe('Discovery')
  })

  it('filters directory clicks by action and search query', () => {
    const events = [discoveryEvent]

    expect(filterAnalyticsEvents(events, { action: 'directory_click' })).toHaveLength(1)
    expect(filterAnalyticsEvents(events, { query: 'strategy' })).toHaveLength(1)
    expect(filterAnalyticsEvents(events, { query: 'missing' })).toHaveLength(0)
  })

  it('counts discovery clicks and rolls them into daily series', () => {
    const events = [discoveryEvent]
    const series = getDailyEventSeries(events, 3)
    const totals = series.reduce(
      (sum, point) => ({
        total: sum.total + point.total,
        discovery: sum.discovery + point.discovery,
        conversions: sum.conversions + point.conversions,
      }),
      { total: 0, discovery: 0, conversions: 0 },
    )

    expect(getDiscoveryClickCount(events)).toBe(1)
    expect(getDiscoveryActionStats(events)).toEqual([{ label: 'public page', total: 1 }])
    expect(totals.total).toBe(1)
    expect(totals.discovery).toBe(1)
    expect(totals.conversions).toBe(0)
  })

  it('identifies likely agent user agents and tracks page visits separately from offer stats', () => {
    const pageView: CheckoutEvent = {
      ...discoveryEvent,
      id: 'evt-2',
      event_type: 'agent_page_view',
      offer_key: 'page',
      agent_user_agent: 'GPTBot/1.0',
      metadata: { source: 'public_agent_page' },
    }

    expect(isLikelyAgentUserAgent('GPTBot/1.0')).toBe(true)
    expect(isLikelyAgentUserAgent('Mozilla/5.0 Safari/605')).toBe(false)
    expect(getAgentPageVisitCount([pageView])).toBe(1)
    expect(getDailyEventSeries([pageView], 3).reduce((sum, point) => sum + point.agentVisits, 0)).toBe(1)
    expect(getTopOfferStats([pageView])).toHaveLength(0)
  })
})
