import { describe, expect, it } from 'vitest'
import type { AgentPage } from '../agent-page'
import {
  assessMarketplacePage,
  canCertifyMarketplacePage,
  normalizeMarketplaceName,
  summarizeMarketplaceCuration,
  type MarketplaceCurationQueueItem,
} from '../marketplace-curation'

const NOW = new Date('2026-07-21T12:00:00.000Z')

function page(overrides: Partial<AgentPage> = {}): AgentPage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Northstar Strategy',
    slug: 'northstar-strategy',
    description: 'Strategy engagements for growing software companies.',
    website_url: 'https://northstar.example',
    cta_url: 'https://northstar.example/book',
    cta_label: 'Book a consultation',
    audience: 'Growing software companies',
    location: 'Remote / worldwide',
    contact_email: 'hello@northstar.example',
    industry: 'Business consulting',
    products: [],
    services: [{ name: 'Strategy sprint', description: 'A focused planning engagement.', price: '$1,500', url: '' }],
    faqs: [{ question: 'How long does it take?', answer: 'Two weeks.' }],
    is_published: true,
    mcp_enabled: true,
    updated_at: '2026-07-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('marketplace quality assessment', () => {
  it('promotes a complete, actionable listing to candidate review', () => {
    const assessment = assessMarketplacePage(page(), { now: NOW })
    expect(assessment).toMatchObject({
      readiness: 100,
      offerCount: 1,
      pricedOfferCount: 1,
      actionableOfferCount: 1,
      blockerCount: 0,
      suggestedStatus: 'candidate',
    })
    expect(assessment.flags).toEqual([])
    expect(canCertifyMarketplacePage(assessment)).toBe(true)
  })

  it('identifies internal fixtures without automatically hiding ordinary customer rows', () => {
    const fixture = assessMarketplacePage(page({ slug: 'gauntlet-negotiation-lab' }), { now: NOW })
    expect(fixture.suggestedStatus).toBe('excluded')
    expect(fixture.flags.map((flag) => flag.id)).toContain('internal_fixture')

    const simulation = assessMarketplacePage(page({
      name: '[Simulation] Northstar Strategy',
      slug: 'simulation-northstar-strategy',
    }), { now: NOW })
    expect(simulation.suggestedStatus).toBe('excluded')
    expect(simulation.flags.map((flag) => flag.id)).toEqual(expect.arrayContaining([
      'internal_fixture',
      'placeholder_identity',
    ]))

    const ordinary = assessMarketplacePage(page({ slug: 'austin-mobility-massage', name: 'Mobility Massage Austin' }), { now: NOW })
    expect(ordinary.flags.map((flag) => flag.id)).not.toContain('internal_fixture')
  })

  it('blocks certification for placeholder, duplicate, incomplete, and stale supply', () => {
    const assessment = assessMarketplacePage(page({
      name: 'ABC Consulting (Copy)',
      slug: 'a',
      description: '',
      location: '',
      industry: '',
      products: [],
      services: [],
      faqs: [],
      website_url: '',
      cta_url: '',
      contact_email: '',
      mcp_enabled: false,
      updated_at: '2025-01-01T00:00:00.000Z',
    }), { duplicateNameCount: 2, now: NOW })

    expect(assessment.flags.map((flag) => flag.id)).toEqual(expect.arrayContaining([
      'placeholder_identity',
      'duplicate_name',
      'missing_description',
      'missing_offers',
      'missing_location',
      'missing_industry',
      'low_readiness',
      'mcp_disabled',
      'stale_listing',
    ]))
    expect(assessment.blockerCount).toBeGreaterThan(0)
    expect(assessment.warningCount).toBe(2)
    expect(assessment.suggestedStatus).toBe('unreviewed')
    expect(canCertifyMarketplacePage(assessment)).toBe(false)
  })

  it('normalizes punctuation and case for duplicate detection', () => {
    expect(normalizeMarketplaceName('  Northstar, Strategy! ')).toBe('northstar strategy')
  })

  it('summarizes review states and quality pressure', () => {
    const assessment = assessMarketplacePage(page(), { now: NOW })
    const item = (status: MarketplaceCurationQueueItem['decision']['status']): MarketplaceCurationQueueItem => ({
      page: page({ id: status }),
      duplicateNameCount: 1,
      assessment,
      decision: {
        pageId: status,
        status,
        decisionReason: null,
        notes: null,
        reviewedBy: null,
        reviewedAt: null,
        certifiedAt: null,
        updatedAt: null,
      },
    })
    const excluded = item('excluded')
    excluded.assessment = { ...excluded.assessment, blockerCount: 2, warningCount: 1 }
    expect(summarizeMarketplaceCuration([item('unreviewed'), item('candidate'), item('certified'), excluded])).toMatchObject({
      total: 4,
      unreviewed: 1,
      candidate: 1,
      certified: 1,
      excluded: 1,
      blockers: 0,
      warnings: 0,
    })
  })
})
