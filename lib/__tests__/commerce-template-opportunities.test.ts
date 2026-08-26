import { describe, expect, it } from 'vitest'
import type { CommerceDemandSnapshot } from '../commerce-demand'
import type { CommerceSupplyWorkflowSnapshot } from '../commerce-supply-workflow'
import type { CommerceTemplateOutcomeReport, CommerceTemplateOutcomeRow } from '../commerce-template-outcomes'
import {
  buildCommerceTemplateOpportunityReport,
  COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS,
  COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED,
  COMMERCE_TEMPLATE_REVIEW_READINESS_GAP,
  type CommerceTemplateOpportunitySources,
} from '../commerce-template-opportunities'
import type { CommerceTemplate } from '../commerce-templates/schema'

describe('Commerce Template opportunity decisions', () => {
  it('ranks observed unresolved demand first without calling category demand version performance', () => {
    const report = build({
      templates: [template('events.party-rentals', 'Party Rentals'), template('events.private-chef', 'Private Chef')],
      demand: demand([
        category('events.party-rentals', 'Party Rentals', 3),
        category('events.private-chef', 'Private Chef', 8),
      ]),
    })

    expect(report.rows.map((row) => [row.templateId, row.demand.unresolved, row.action])).toEqual([
      ['events.private-chef', 8, 'recruit-exact-supply'],
      ['events.party-rentals', 3, 'recruit-exact-supply'],
    ])
    expect(report.rows[0].reason).toContain('8 recent requests')
  })

  it('keeps launch coverage useful when demand is unavailable without inventing zero demand', () => {
    const report = build({ demand: { ...demand([]), available: false } })

    expect(report.rows[0]).toMatchObject({
      action: 'recruit-exact-supply',
      demand: { available: false, observed: null, unresolved: null },
    })
    expect(report.rows[0].reason).toContain('no buyer demand is inferred')
  })

  it('fails closed when certified marketplace coverage cannot be checked', () => {
    const report = build({ supply: { ...supply(), verificationAvailable: false } })

    expect(report.rows[0]).toMatchObject({
      action: 'refresh-evidence',
      actionLabel: 'Refresh marketplace evidence',
      supply: { available: false, certifiedListings: null },
    })
  })

  it('starts exact-version adoption only after certified supply is verified', () => {
    const report = build({ supply: supply({ certified: true }) })

    expect(report.rows[0]).toMatchObject({
      action: 'start-template-use',
      adoption: { listings: 0, publishedListings: 0 },
    })
    expect(report.rows[0].reason).toContain('version 1')
  })

  it('prioritizes publishing when adopted listings have not gone live', () => {
    const report = build({
      supply: supply({ certified: true }),
      outcomes: outcomes([outcome({ listings: 2, publishedListings: 0 })]),
    })

    expect(report.rows[0]).toMatchObject({ action: 'help-merchants-publish' })
    expect(report.rows[0].reason).toContain('2 listings')
  })

  it('waits for an explicit evidence floor before recommending a template review', () => {
    const report = build({
      supply: supply({ certified: true }),
      outcomes: outcomes([outcome({
        listings: COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS - 1,
        publishedListings: COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED,
        readinessVsNoTemplate: COMMERCE_TEMPLATE_REVIEW_READINESS_GAP - 10,
      })]),
    })

    expect(report.rows[0]).toMatchObject({ action: 'gather-more-evidence', tone: 'watch' })
  })

  it('recommends a human review only for a sufficiently large lagging version cohort', () => {
    const report = build({
      supply: supply({ certified: true }),
      outcomes: outcomes([outcome({
        listings: COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS,
        publishedListings: COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED,
        readinessVsNoTemplate: COMMERCE_TEMPLATE_REVIEW_READINESS_GAP,
      })]),
    })

    expect(report.rows[0]).toMatchObject({
      action: 'review-template',
      actionLabel: 'Review this guide',
      tone: 'attention',
    })
    expect(report.rows[0].reason).toContain('before creating a new version')
  })

  it('keeps a supported version unchanged when evidence clears the review boundary', () => {
    const report = build({
      supply: supply({ certified: true }),
      outcomes: outcomes([outcome({
        listings: COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS,
        publishedListings: COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED,
        readinessVsNoTemplate: 2,
      })]),
    })

    expect(report.rows[0]).toMatchObject({ action: 'keep-and-monitor', tone: 'steady' })
  })

  it('preserves unavailable money sources instead of rendering false zeros', () => {
    const report = build({
      supply: supply({ certified: true }),
      outcomes: outcomes([outcome({
        listings: COMMERCE_TEMPLATE_REVIEW_MIN_LISTINGS,
        publishedListings: COMMERCE_TEMPLATE_REVIEW_MIN_PUBLISHED,
        readinessVsNoTemplate: 0,
      })]),
      sources: { ...availableSources(), checkout: false },
    })

    expect(report.rows[0]).toMatchObject({
      action: 'refresh-evidence',
      checkout: { available: false, orders: null, listings: null, rails: null },
    })
  })

  it('excludes draft and deprecated definitions from the current decision map', () => {
    const report = build({
      templates: [
        template('events.party-rentals', 'Party Rentals'),
        { ...template('events.party-rentals', 'Party Rentals', 2), status: 'draft' },
        { ...template('events.private-chef', 'Private Chef'), status: 'deprecated' },
      ],
    })

    expect(report.rows.map((row) => `${row.templateId}@${row.templateVersion}`)).toEqual([
      'events.party-rentals@1',
    ])
  })
})

function build(overrides: Partial<Parameters<typeof buildCommerceTemplateOpportunityReport>[0]> = {}) {
  return buildCommerceTemplateOpportunityReport({
    templates: [template('events.party-rentals', 'Party Rentals')],
    demand: demand([]),
    supply: supply(),
    outcomes: outcomes([]),
    sources: availableSources(),
    ...overrides,
  })
}

function availableSources(): CommerceTemplateOpportunitySources {
  return { listings: true, benchmark: true, checkout: true, negotiated: true }
}

function template(id: string, title: string, version = 1): CommerceTemplate {
  return {
    id,
    version,
    status: 'active',
    domain: 'events-hospitality',
    industry: title,
    title,
    description: `${title} template`,
    primaryArchetype: 'quote-required',
    matchHints: { industries: [title], keywords: [title.toLowerCase()] },
    customerJobs: [],
    customerIntents: [],
    offerBlueprints: [],
    requiredFacts: [],
    qualityFacts: [],
    opportunityFacts: [],
    pricingModes: ['quote'],
    fulfillmentModes: ['customer-location'],
    schedulingModes: ['date-window'],
    paymentModes: ['full-checkout'],
    capabilityTags: ['QUOTE_REQUIRED'],
    evals: [],
  }
}

function demand(categories: CommerceDemandSnapshot['categories']): CommerceDemandSnapshot {
  return {
    generatedAt: '2026-08-25T12:00:00.000Z',
    since: '2026-07-26T12:00:00.000Z',
    available: true,
    truncated: false,
    totalSignals: categories.reduce((total, item) => total + item.observed, 0),
    mappedSignals: categories.reduce((total, item) => total + item.observed, 0),
    liveMatches: 0,
    relatedMatches: 0,
    referenceMatches: categories.reduce((total, item) => total + item.unresolved, 0),
    coverageGaps: 0,
    categories,
  }
}

function category(referenceId: string, title: string, unresolved: number): CommerceDemandSnapshot['categories'][number] {
  return {
    referenceId,
    title,
    domain: 'events-hospitality',
    observed: unresolved,
    live: 0,
    related: 0,
    reference: unresolved,
    unresolved,
  }
}

function supply(options: { certified?: boolean } = {}): CommerceSupplyWorkflowSnapshot {
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
      action: options.certified ? 'monitor-certified-supply' : 'recruit-exact-supply',
      actionLabel: options.certified ? 'Coverage established' : 'Recruit exact supply',
      rationale: 'Evidence-bound action.',
      observed: 0,
      live: 0,
      related: 0,
      reference: 0,
      unresolved: 0,
      campaign: null,
      status: options.certified ? 'live' : 'new',
      brief: {
        objective: 'Recruit exact supply.',
        merchantProfile: 'Exact category merchant.',
        verificationQuestions: [],
        capabilityTags: [],
        successBoundary: 'Category coverage only.',
      },
      certifiedSupply: options.certified ? [{
        pageId: 'page-1',
        pageName: 'Party Co.',
        pageSlug: 'party-co',
        offerName: 'Party Rentals',
      }] : [],
    }],
  }
}

function outcomes(templates: CommerceTemplateOutcomeRow[]): CommerceTemplateOutcomeReport {
  return {
    summary: {
      templateVersions: templates.length,
      listings: templates.reduce((total, row) => total + row.listings, 0),
      publishedListings: templates.reduce((total, row) => total + row.publishedListings, 0),
      publishedRate: null,
      averageReadiness: null,
      checkoutOrders: templates.reduce((total, row) => total + row.checkout.orders, 0),
      checkoutListings: templates.reduce((total, row) => total + row.checkout.listings, 0),
      negotiatedDeals: templates.reduce((total, row) => total + row.negotiated.deals, 0),
      negotiatedListings: templates.reduce((total, row) => total + row.negotiated.listings, 0),
    },
    noTemplateBenchmark: { listings: 1, publishedListings: 1, publishedRate: 100, averageReadiness: 80 },
    templates,
  }
}

function outcome(input: Partial<CommerceTemplateOutcomeRow> = {}): CommerceTemplateOutcomeRow {
  const listings = input.listings ?? 1
  const publishedListings = input.publishedListings ?? 1
  return {
    templateId: 'events.party-rentals',
    templateVersion: 1,
    title: 'Party Rentals',
    listings,
    publishedListings,
    publishedRate: listings ? Math.round((publishedListings / listings) * 100) : null,
    averageReadiness: 80,
    readinessVsNoTemplate: 0,
    checkout: {
      orders: 0,
      listings: 0,
      rails: {
        hosted_checkout: 0,
        protocol_checkout: 0,
        recurring_service: 0,
        staged_settlement: 0,
        resource_reservation: 0,
      },
    },
    negotiated: { deals: 0, listings: 0 },
    ...input,
  }
}
