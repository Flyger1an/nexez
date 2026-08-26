import { describe, expect, it } from 'vitest'
import {
  buildCommerceTemplateActivationReport,
  type CommerceTemplateActivationListing,
} from '../commerce-template-activation'
import type { CommerceSupplyWorkflowSnapshot } from '../commerce-supply-workflow'
import type { MarketplaceCurationQueue, MarketplaceCurationStatus } from '../marketplace-curation'
import type { CommerceTemplate } from '../commerce-templates/schema'

describe('Commerce Template activation queue', () => {
  it('keeps draft, review, published, and exact certified states distinct', () => {
    const report = build({
      listings: [
        listing('draft', { isPublished: false, readiness: 35 }),
        listing('review', { readiness: 60 }),
        listing('certified', { readiness: 90 }),
        listing('published', { readiness: 80 }),
      ],
      marketplace: marketplace({
        review: 'candidate',
        certified: 'certified',
        published: 'certified',
      }),
      supply: supply([
        { pageId: 'certified', pageName: 'Certified Co.', pageSlug: 'certified', offerName: 'Party Rentals' },
      ]),
    })

    expect(report.groups[0].listings.map((row) => [row.id, row.status])).toEqual([
      ['draft', 'needs-publishing'],
      ['review', 'needs-marketplace-review'],
      ['published', 'published'],
      ['certified', 'exact-certified-supply'],
    ])
    expect(report.summary).toMatchObject({
      listings: 4,
      needsPublishing: 1,
      published: 3,
      certifiedOnGuide: 1,
    })
  })

  it('separates exact certified supply outside the active guide version', () => {
    const report = build({
      listings: [
        listing('on-guide'),
        listing('old-version', { templateVersion: 2 }),
        listing('other-guide', { templateId: 'events.private-chef' }),
      ],
      supply: supply([
        { pageId: 'on-guide', pageName: 'On Guide', pageSlug: 'on-guide', offerName: 'Party Rentals' },
        { pageId: 'old-version', pageName: 'Old Version', pageSlug: 'old-version', offerName: 'Party Rentals' },
        { pageId: 'other-guide', pageName: 'Other Guide', pageSlug: 'other-guide', offerName: 'Party Rentals' },
        { pageId: 'no-guide', pageName: 'No Guide', pageSlug: 'no-guide', offerName: 'Party Rentals' },
      ]),
    })

    expect(report.groups[0].certifiedOutsideVersion).toEqual([
      expect.objectContaining({ pageId: 'no-guide', relationship: 'no-recorded-guide' }),
      expect.objectContaining({ pageId: 'old-version', relationship: 'different-version' }),
      expect.objectContaining({ pageId: 'other-guide', relationship: 'different-guide' }),
    ])
    expect(report.summary.certifiedOutsideGuide).toBe(3)
    expect(report.summary.outsideActiveGuides).toBe(2)
  })

  it('does not turn unavailable marketplace or supply evidence into false workflow states', () => {
    const report = build({
      listings: [listing('published')],
      marketplace: { ...marketplace({}), available: false },
      supply: { ...supply([]), verificationAvailable: false },
    })

    expect(report.groups[0]).toMatchObject({
      listings: [{ id: 'published', status: 'published', marketplaceStatus: null }],
      certifiedOutsideVersion: null,
      summary: { marketplaceReview: null, certifiedOnVersion: null },
    })
    expect(report.summary.certifiedOnGuide).toBeNull()
    expect(report.summary.certifiedOutsideGuide).toBeNull()
  })

  it('fails closed when private lineage cannot be read', () => {
    const report = build({ listingsAvailable: false, listings: [listing('hidden')] })

    expect(report.available).toBe(false)
    expect(report.summary).toMatchObject({
      listings: null,
      needsPublishing: null,
      published: null,
      outsideActiveGuides: null,
    })
    expect(report.groups[0].listings).toEqual([])
    expect(report.groups[0].certifiedOutsideVersion).toBeNull()
  })

  it('ignores invalid lineage and keeps inactive versions outside the active queue', () => {
    const report = build({
      listings: [
        listing('active'),
        listing('invalid', { templateVersion: 0 }),
        listing('legacy', { templateVersion: 2 }),
        listing('untrusted', { source: null }),
      ],
    })

    expect(report.groups[0].listings.map((row) => row.id)).toEqual(['active'])
    expect(report.summary.outsideActiveGuides).toBe(1)
  })
})

function build(overrides: Partial<Parameters<typeof buildCommerceTemplateActivationReport>[0]> = {}) {
  return buildCommerceTemplateActivationReport({
    templates: [template()],
    listings: [],
    listingsAvailable: true,
    listingsTruncated: false,
    marketplace: marketplace({}),
    supply: supply([]),
    ...overrides,
  })
}

function listing(id: string, overrides: Partial<CommerceTemplateActivationListing> = {}): CommerceTemplateActivationListing {
  return {
    id,
    name: `${id} listing`,
    slug: id,
    isPublished: true,
    readiness: 75,
    templateId: 'events.party-rentals',
    templateVersion: 1,
    adoptedAt: '2026-08-25T12:00:00.000Z',
    source: 'owner_selected_intake',
    ...overrides,
  }
}

function marketplace(statuses: Record<string, MarketplaceCurationStatus>): MarketplaceCurationQueue {
  return {
    generatedAt: '2026-08-25T12:00:00.000Z',
    available: true,
    items: Object.entries(statuses).map(([pageId, status]) => ({
      page: { id: pageId, name: pageId, slug: pageId } as MarketplaceCurationQueue['items'][number]['page'],
      decision: {
        pageId,
        status,
        decisionReason: null,
        notes: null,
        reviewedBy: null,
        reviewedAt: null,
        certifiedAt: status === 'certified' ? '2026-08-25T12:00:00.000Z' : null,
        updatedAt: null,
      },
      assessment: {} as MarketplaceCurationQueue['items'][number]['assessment'],
      duplicateNameCount: 1,
    })),
    summary: { total: 0, unreviewed: 0, candidate: 0, certified: 0, excluded: 0, blockers: 0, warnings: 0 },
  }
}

function supply(certifiedSupply: CommerceSupplyWorkflowSnapshot['items'][number]['certifiedSupply']): CommerceSupplyWorkflowSnapshot {
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
      basis: 'launch-coverage',
      basisLabel: 'Launch coverage',
      action: certifiedSupply.length ? 'monitor-certified-supply' : 'recruit-exact-supply',
      actionLabel: certifiedSupply.length ? 'Coverage established' : 'Recruit exact supply',
      rationale: 'Evidence-bound action.',
      observed: 0,
      live: 0,
      related: 0,
      reference: 0,
      unresolved: 0,
      campaign: null,
      status: certifiedSupply.length ? 'live' : 'new',
      brief: {
        objective: 'Monitor supply.',
        merchantProfile: 'Exact category merchant.',
        verificationQuestions: [],
        capabilityTags: [],
        successBoundary: 'Category coverage only.',
      },
      certifiedSupply,
    }],
  }
}

function template(): CommerceTemplate {
  return {
    id: 'events.party-rentals',
    version: 1,
    status: 'active',
    domain: 'events-hospitality',
    industry: 'Party Rentals',
    title: 'Party Rentals',
    description: 'Party Rentals guide',
    primaryArchetype: 'inventory-rental',
    matchHints: { industries: ['Party Rentals'], keywords: ['party rentals'] },
    customerJobs: [],
    customerIntents: [],
    offerBlueprints: [],
    requiredFacts: [],
    qualityFacts: [],
    opportunityFacts: [],
    pricingModes: ['quote'],
    fulfillmentModes: ['delivery'],
    schedulingModes: ['date-window'],
    paymentModes: ['full-checkout'],
    capabilityTags: ['INVENTORY'],
    evals: [],
  }
}
