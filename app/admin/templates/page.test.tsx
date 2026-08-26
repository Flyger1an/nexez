// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../../test/dom'
import type { CommerceTemplateOpportunitySnapshot } from '../../../lib/server/commerce-template-opportunities'
import type { CommerceTemplateOutcomeSnapshot } from '../../../lib/server/commerce-template-outcomes'

const requireAdmin = vi.hoisted(() => vi.fn(async () => ({ id: 'admin-1' })))
const getSnapshot = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: requireAdmin }))
vi.mock('../../../lib/server/commerce-template-opportunities', () => ({ getCommerceTemplateOpportunitySnapshot: getSnapshot }))

import AdminTemplateOutcomesPage from './page'

describe('AdminTemplateOutcomesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSnapshot.mockResolvedValue(opportunitySnapshot())
  })

  it('authorizes before rendering evidence-bound next moves and exact-version outcomes', async () => {
    render(await AdminTemplateOutcomesPage())

    expect(requireAdmin).toHaveBeenCalledWith('/admin/templates')
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(getSnapshot.mock.invocationCallOrder[0])
    expect(screen.getByRole('heading', { name: 'What to improve next' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Next moves' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Merchant launch queue' })).toBeInTheDocument()
    expect(screen.getByText('Party Co.')).toBeInTheDocument()
    expect(screen.getAllByText('Exact certified supply').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /Open listing/ })).toHaveAttribute('href', 'https://nexez.test/party-co')
    expect(screen.getByText('Recruit an exact merchant')).toBeInTheDocument()
    expect(screen.getByText(/Buyer interest is category-level/)).toBeInTheDocument()
    expect(screen.getByText(/There is no combined opportunity score/)).toBeInTheDocument()
    expect(screen.getAllByText('Party Rentals').length).toBeGreaterThan(0)
    expect(screen.getByText('+16 points vs no recorded template')).toBeInTheDocument()
    expect(screen.getByText('Agent protocols 1')).toBeInTheDocument()
    expect(screen.getByText(/directional cohort results/i)).toBeInTheDocument()
  })

  it('does not render false checkout zeros when that source is unavailable', async () => {
    const snapshot = opportunitySnapshot()
    snapshot.sources.checkout = false
    snapshot.warnings = ['Live checkout outcomes are unavailable. Checkout values are not shown as zero.']
    snapshot.rows[0].checkout = { available: false, orders: null, listings: null, rails: null }
    snapshot.outcomes.sources.checkout = { available: false, truncated: false }
    snapshot.outcomes.warnings = [...snapshot.warnings]
    getSnapshot.mockResolvedValueOnce(snapshot)

    render(await AdminTemplateOutcomesPage())

    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(screen.getByText('Checkout unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Checkout values are not shown as zero/)).toBeInTheDocument()
  })

  it('fails the merchant queue closed when private guide history is unavailable', async () => {
    const snapshot = opportunitySnapshot()
    snapshot.activation = {
      ...snapshot.activation,
      available: false,
      sources: {
        ...snapshot.activation.sources,
        listings: { available: false, truncated: false },
      },
      summary: {
        ...snapshot.activation.summary,
        listings: null,
        needsPublishing: null,
        published: null,
        certifiedOnGuide: null,
        certifiedOutsideGuide: null,
        outsideActiveGuides: null,
      },
      groups: snapshot.activation.groups.map((group) => ({
        ...group,
        listings: [],
        certifiedOutsideVersion: null,
      })),
    }
    getSnapshot.mockResolvedValueOnce(snapshot)

    render(await AdminTemplateOutcomesPage())

    expect(screen.getByRole('heading', { name: 'Merchant launch data is unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('Party Co.')).not.toBeInTheDocument()
  })
})

function opportunitySnapshot(): CommerceTemplateOpportunitySnapshot {
  const outcomes = outcomeSnapshot()
  return {
    generatedAt: '2026-08-25T12:00:00.000Z',
    demandSince: '2026-07-26T12:00:00.000Z',
    warnings: [],
    sources: {
      demand: true,
      demandTruncated: false,
      supply: true,
      listings: true,
      benchmark: true,
      checkout: true,
      negotiated: true,
    },
    summary: { templates: 1, needsAction: 1, recruit: 1, activate: 0, review: 0, monitoring: 0 },
    rows: [{
      rank: 1,
      templateId: 'events.party-rentals',
      templateVersion: 1,
      title: 'Party Rentals',
      domain: 'events-hospitality',
      action: 'recruit-exact-supply',
      actionLabel: 'Recruit an exact merchant',
      reason: '4 recent requests reached related or reference-only results, and no exact certified merchant is published.',
      tone: 'attention',
      demand: { available: true, truncated: false, observed: 4, unresolved: 4 },
      supply: { available: true, certifiedListings: 0 },
      adoption: {
        available: true,
        listings: 2,
        publishedListings: 1,
        publishedRate: 50,
        averageReadiness: 86,
        readinessVsNoTemplate: 16,
      },
      checkout: {
        available: true,
        orders: 1,
        listings: 1,
        rails: { hosted_checkout: 0, protocol_checkout: 1, recurring_service: 0, staged_settlement: 0, resource_reservation: 0 },
      },
      negotiated: { available: true, deals: 1, listings: 1 },
    }],
    activation: {
      available: true,
      sources: {
        listings: { available: true, truncated: false },
        marketplace: true,
        supply: true,
      },
      summary: {
        activeGuides: 1,
        listings: 1,
        needsPublishing: 0,
        published: 1,
        certifiedOnGuide: 1,
        certifiedOutsideGuide: 0,
        outsideActiveGuides: 0,
      },
      groups: [{
        templateId: 'events.party-rentals',
        templateVersion: 1,
        title: 'Party Rentals',
        listings: [{
          id: 'page-1',
          name: 'Party Co.',
          slug: 'party-co',
          isPublished: true,
          readiness: 86,
          templateId: 'events.party-rentals',
          templateVersion: 1,
          adoptedAt: '2026-08-25T11:00:00.000Z',
          source: 'owner_selected_intake',
          status: 'exact-certified-supply',
          marketplaceStatus: 'certified',
          nextAction: 'Keep the listing current and monitor results',
        }],
        certifiedOutsideVersion: [],
        summary: {
          listings: 1,
          needsPublishing: 0,
          published: 1,
          marketplaceReview: 0,
          certifiedOnVersion: 1,
        },
      }],
    },
    outcomes,
  }
}

function outcomeSnapshot(): CommerceTemplateOutcomeSnapshot {
  return {
    available: true,
    generatedAt: '2026-08-25T12:00:00.000Z',
    cohortStartedAt: '2026-08-25T11:00:00.000Z',
    warnings: [],
    lineageListings: [{
      id: 'page-1',
      name: 'Party Co.',
      slug: 'party-co',
      isPublished: true,
      readiness: 86,
      templateId: 'events.party-rentals',
      templateVersion: 1,
      adoptedAt: '2026-08-25T11:00:00.000Z',
      source: 'owner_selected_intake',
    }],
    sources: {
      listings: { available: true, truncated: false },
      benchmark: { available: true, truncated: false },
      checkout: { available: true, truncated: false },
      negotiated: { available: true, truncated: false },
    },
    summary: {
      templateVersions: 1,
      listings: 2,
      publishedListings: 1,
      publishedRate: 50,
      averageReadiness: 86,
      checkoutOrders: 1,
      checkoutListings: 1,
      negotiatedDeals: 1,
      negotiatedListings: 1,
    },
    noTemplateBenchmark: { listings: 3, publishedListings: 1, publishedRate: 33.3, averageReadiness: 70 },
    templates: [{
      templateId: 'events.party-rentals',
      templateVersion: 1,
      title: 'Party Rentals',
      listings: 2,
      publishedListings: 1,
      publishedRate: 50,
      averageReadiness: 86,
      readinessVsNoTemplate: 16,
      checkout: {
        orders: 1,
        listings: 1,
        rails: { hosted_checkout: 0, protocol_checkout: 1, recurring_service: 0, staged_settlement: 0, resource_reservation: 0 },
      },
      negotiated: { deals: 1, listings: 1 },
    }],
  }
}
