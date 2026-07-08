import { describe, expect, it } from 'vitest'
import {
  filterAnalyticsEvents,
  getAgentName,
  getAgentDrivenRevenueCents,
  getPipelineCents,
  getRevenueCents,
  getRevenueCentsByCurrency,
  getRevenueCurrency,
  getAgentPageVisitCount,
  getDailyEventSeries,
  getDiscoveryActionStats,
  getDiscoveryClickCount,
  getReadinessInsight,
  getSignalLabel,
  getTopOfferStats,
  isLikelyAgentUserAgent,
} from '../analytics'
import { CheckoutEvent, getEventActionLabel } from '../checkout-events'
import type { AgentPage } from '../agent-page'

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

describe('getReadinessInsight', () => {
  const makePage = (slug: string, complete: boolean): AgentPage =>
    ({
      id: slug,
      owner_id: 'o1',
      name: complete ? `${slug} business` : slug,
      slug,
      description: complete ? 'A clear, complete description of what we offer.' : null,
      website_url: complete ? 'https://example.com' : null,
      cta_url: complete ? 'https://example.com/book' : null,
      audience: complete ? 'B2B founders' : null,
      location: complete ? 'Austin' : null,
      contact_email: complete ? 'hi@example.com' : null,
      industry: complete ? 'consulting' : null,
      products: null,
      services: complete
        ? [{ name: 'Strategy Session', description: 'A focused session', price: '$450', url: 'https://example.com/book' }]
        : [],
      faqs: complete ? [{ question: 'How long?', answer: '60 minutes' }] : null,
      is_published: true,
    }) as AgentPage

  it('scores the agent-engaged subset higher when those pages are better built', () => {
    const pages = [makePage('alpha', true), makePage('beta', false)]
    const visits = [{ slug: 'alpha', is_ai_agent: true }]
    const insight = getReadinessInsight(pages, [], visits)

    expect(insight.activeCount).toBe(1)
    expect(insight.avgActive).toBeGreaterThan(insight.avgAll)
    expect(insight.lift).toBe(insight.avgActive - insight.avgAll)
  })

  it('returns zeroes when there is no activity', () => {
    const insight = getReadinessInsight([makePage('alpha', true)], [], [])
    expect(insight).toEqual({ avgAll: expect.any(Number), avgActive: 0, activeCount: 0, lift: expect.any(Number) })
  })
})

describe('getAgentName', () => {
  it('recognizes the OpenClaw plugin as a first-class agent channel', () => {
    // The OpenClaw Nexez plugin sends this User-Agent on public checkout/search calls.
    expect(getAgentName('OpenClaw Nexez Plugin')).toBe('OpenClaw-Agent')
    expect(getAgentName('openclaw/2026.5.17')).toBe('OpenClaw-Agent')
  })

  it('still normalizes the other known agents and falls back otherwise', () => {
    expect(getAgentName('ChatGPT-User/1.0')).toBe('ChatGPT-Agent')
    expect(getAgentName('Claude-Web')).toBe('Claude-Agent')
    expect(getAgentName('Grok')).toBe('Grok-Agent')
    expect(getAgentName('SomeRandomBot/2')).toBe('Generic Agent')
    expect(getAgentName(null)).toBe('Unknown agent')
    expect(getAgentName('CustomThing/1.0')).toBe('CustomThing/1.0')
  })
})

// Currency-scoped revenue rollups: amounts settling in different currencies are
// different units and must never be summed into one number.
describe('revenue rollups (currency scoping)', () => {
  const sale = (id: string, amountCents: number, currency?: string, over: Partial<CheckoutEvent> = {}): CheckoutEvent => ({
    ...discoveryEvent,
    id,
    event_type: 'stripe_session_created',
    agent_user_agent: 'Claude-Agent/1.0',
    metadata: { amount_cents: amountCents, ...(currency ? { currency } : {}) },
    ...over,
  })

  it('a mixed workspace sums ONLY the dominant currency (no cross-currency sums)', () => {
    const events = [sale('u1', 10_000, 'usd'), sale('u2', 5_000, 'usd'), sale('j1', 900_000, 'jpy')]
    expect(getRevenueCurrency(events)).toBe('usd')
    expect(getRevenueCents(events)).toBe(15_000) // the 900,000 JPY never leaks in
    expect(getAgentDrivenRevenueCents(events)).toBe(15_000)
    expect(getPipelineCents(events)).toBe(15_000)
  })

  it('an explicit currency scopes the sum to that currency', () => {
    const events = [sale('u1', 10_000, 'usd'), sale('j1', 900_000, 'jpy')]
    expect(getRevenueCents(events, 'jpy')).toBe(900_000)
    expect(getRevenueCents(events, 'usd')).toBe(10_000)
  })

  it('getRevenueCentsByCurrency returns the full per-currency breakdown', () => {
    const events = [sale('u1', 10_000, 'usd'), sale('u2', 2_500, 'usd'), sale('j1', 900_000, 'jpy')]
    const byCurrency = getRevenueCentsByCurrency(events)
    expect(byCurrency.get('usd')).toBe(12_500)
    expect(byCurrency.get('jpy')).toBe(900_000)
  })

  it('rows that predate multi-currency (no metadata.currency) count as usd', () => {
    const events = [sale('legacy', 4_000), sale('u1', 1_000, 'usd')]
    expect(getRevenueCents(events)).toBe(5_000)
  })
})
