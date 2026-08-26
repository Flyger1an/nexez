import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommerceDemandSnapshot } from '../commerce-demand'
import type { CommerceSupplyWorkflowSnapshot } from '../commerce-supply-workflow'
import type { MarketplaceCurationQueue } from '../marketplace-curation'
import type { CommerceTemplateOutcomeSnapshot } from './commerce-template-outcomes'

const refs = vi.hoisted(() => ({
  demand: null as CommerceDemandSnapshot | null,
  marketplace: null as MarketplaceCurationQueue | null,
  supply: null as CommerceSupplyWorkflowSnapshot | null,
  outcomes: null as CommerceTemplateOutcomeSnapshot | null,
}))

const getDemand = vi.hoisted(() => vi.fn(async () => refs.demand as CommerceDemandSnapshot))
const getMarketplace = vi.hoisted(() => vi.fn(async () => refs.marketplace as MarketplaceCurationQueue))
const getSupply = vi.hoisted(() => vi.fn(async () => refs.supply as CommerceSupplyWorkflowSnapshot))
const getOutcomes = vi.hoisted(() => vi.fn(async () => refs.outcomes as CommerceTemplateOutcomeSnapshot))

vi.mock('./commerce-demand', () => ({ getCommerceDemandSnapshot: getDemand }))
vi.mock('./marketplace-curation', () => ({ getMarketplaceCurationQueue: getMarketplace }))
vi.mock('./commerce-supply-workflow', () => ({ getCommerceSupplyWorkflowSnapshot: getSupply }))
vi.mock('./commerce-template-outcomes', () => ({ getCommerceTemplateOutcomeSnapshot: getOutcomes }))

import { getCommerceTemplateOpportunitySnapshot } from './commerce-template-opportunities'

describe('server Commerce Template opportunity snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.demand = demand()
    refs.marketplace = marketplace()
    refs.supply = supply()
    refs.outcomes = outcomes()
  })

  it('loads independent evidence in parallel and composes supply from the same snapshots', async () => {
    const snapshot = await getCommerceTemplateOpportunitySnapshot()

    expect(getDemand).toHaveBeenCalledOnce()
    expect(getMarketplace).toHaveBeenCalledOnce()
    expect(getOutcomes).toHaveBeenCalledOnce()
    expect(getSupply).toHaveBeenCalledWith(refs.demand, refs.marketplace)
    expect(snapshot.rows.find((row) => row.templateId === 'events.party-rentals')).toMatchObject({
      action: 'keep-and-monitor',
      demand: { unresolved: 4 },
      supply: { certifiedListings: 1 },
      adoption: { listings: 5, publishedListings: 3 },
      checkout: { orders: 1 },
      negotiated: { deals: 1 },
    })
    expect(snapshot.outcomes).toBe(refs.outcomes)
    expect(snapshot.warnings).toEqual([])
  })

  it('preserves source failures as unavailable values and readable warnings', async () => {
    refs.demand = { ...demand(), available: false, categories: [] }
    refs.supply = { ...supply(), verificationAvailable: false }
    refs.outcomes = {
      ...outcomes(),
      sources: {
        listings: { available: true, truncated: false },
        benchmark: { available: false, truncated: false },
        checkout: { available: false, truncated: false },
        negotiated: { available: true, truncated: false },
      },
      warnings: ['Live checkout outcomes are unavailable. Checkout values are not shown as zero.'],
    }

    const snapshot = await getCommerceTemplateOpportunitySnapshot()
    const partyRentals = snapshot.rows.find((row) => row.templateId === 'events.party-rentals')

    expect(partyRentals).toMatchObject({
      action: 'refresh-evidence',
      demand: { available: false, unresolved: null },
      supply: { available: false, certifiedListings: null },
      checkout: { available: false, orders: null },
    })
    expect(snapshot.warnings).toEqual(expect.arrayContaining([
      'Buyer request signals are unavailable. Demand values are not shown as zero.',
      'Certified marketplace coverage is unavailable. Supply values are not shown as zero.',
      'Live checkout outcomes are unavailable. Checkout values are not shown as zero.',
    ]))
  })

  it('labels truncated demand as a lower bound without disabling other evidence', async () => {
    refs.demand = { ...demand(), truncated: true }
    const snapshot = await getCommerceTemplateOpportunitySnapshot()

    expect(snapshot.sources.demand).toBe(true)
    expect(snapshot.sources.demandTruncated).toBe(true)
    expect(snapshot.warnings).toContain('Buyer request signals reached the reporting limit. Displayed demand is a lower bound.')
  })
})

function demand(): CommerceDemandSnapshot {
  return {
    generatedAt: '2026-08-25T12:00:00.000Z',
    since: '2026-07-26T12:00:00.000Z',
    available: true,
    truncated: false,
    totalSignals: 4,
    mappedSignals: 4,
    liveMatches: 0,
    relatedMatches: 1,
    referenceMatches: 3,
    coverageGaps: 0,
    categories: [{
      referenceId: 'events.party-rentals',
      title: 'Party Rentals',
      domain: 'events-hospitality',
      observed: 4,
      live: 0,
      related: 1,
      reference: 3,
      unresolved: 4,
    }],
  }
}

function marketplace(): MarketplaceCurationQueue {
  return {
    generatedAt: '2026-08-25T12:00:00.000Z',
    available: true,
    items: [],
    summary: { total: 0, unreviewed: 0, candidate: 0, certified: 0, excluded: 0, blockers: 0, warnings: 0 },
  }
}

function supply(): CommerceSupplyWorkflowSnapshot {
  return {
    generatedAt: '2026-08-25T12:00:00.000Z',
    available: true,
    demandAvailable: true,
    verificationAvailable: true,
    items: [{
      rank: 1,
      referenceId: 'events.party-rentals',
      title: 'Party Rentals',
      domain: 'events-hospitality',
      lifecycle: 'active-template',
      lifecycleLabel: 'Active template',
      basis: 'observed-demand',
      basisLabel: 'Observed demand',
      action: 'monitor-certified-supply',
      actionLabel: 'Coverage established',
      rationale: 'Exact category supply is certified.',
      observed: 4,
      live: 0,
      related: 1,
      reference: 3,
      unresolved: 4,
      campaign: null,
      status: 'live',
      brief: {
        objective: 'Monitor certified supply.',
        merchantProfile: 'Exact category merchant.',
        verificationQuestions: [],
        capabilityTags: [],
        successBoundary: 'Category coverage only.',
      },
      certifiedSupply: [{
        pageId: 'page-1',
        pageName: 'Party Co.',
        pageSlug: 'party-co',
        offerName: 'Party Rentals',
      }],
    }],
  }
}

function outcomes(): CommerceTemplateOutcomeSnapshot {
  return {
    available: true,
    generatedAt: '2026-08-25T12:00:00.000Z',
    cohortStartedAt: '2026-08-25T10:00:00.000Z',
    warnings: [],
    sources: {
      listings: { available: true, truncated: false },
      benchmark: { available: true, truncated: false },
      checkout: { available: true, truncated: false },
      negotiated: { available: true, truncated: false },
    },
    summary: {
      templateVersions: 1,
      listings: 5,
      publishedListings: 3,
      publishedRate: 60,
      averageReadiness: 85,
      checkoutOrders: 1,
      checkoutListings: 1,
      negotiatedDeals: 1,
      negotiatedListings: 1,
    },
    noTemplateBenchmark: { listings: 5, publishedListings: 2, publishedRate: 40, averageReadiness: 80 },
    templates: [{
      templateId: 'events.party-rentals',
      templateVersion: 1,
      title: 'Party Rentals',
      listings: 5,
      publishedListings: 3,
      publishedRate: 60,
      averageReadiness: 85,
      readinessVsNoTemplate: 5,
      checkout: {
        orders: 1,
        listings: 1,
        rails: {
          hosted_checkout: 1,
          protocol_checkout: 0,
          recurring_service: 0,
          staged_settlement: 0,
          resource_reservation: 0,
        },
      },
      negotiated: { deals: 1, listings: 1 },
    }],
  }
}
