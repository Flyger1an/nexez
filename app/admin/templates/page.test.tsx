// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../../test/dom'

const requireAdmin = vi.hoisted(() => vi.fn(async () => ({ id: 'admin-1' })))
const getSnapshot = vi.hoisted(() => vi.fn(async (): Promise<import('../../../lib/server/commerce-template-outcomes').CommerceTemplateOutcomeSnapshot> => ({
  available: true,
  generatedAt: '2026-08-25T12:00:00.000Z',
  cohortStartedAt: '2026-08-25T11:00:00.000Z',
  warnings: [],
  sources: {
    listings: { available: true, truncated: false },
    benchmark: { available: true, truncated: false },
    checkout: { available: true, truncated: false },
    negotiated: { available: true, truncated: false },
  },
  summary: {
    templateVersions: 1, listings: 2, publishedListings: 1, publishedRate: 50,
    averageReadiness: 86, checkoutOrders: 1, checkoutListings: 1,
    negotiatedDeals: 1, negotiatedListings: 1,
  },
  noTemplateBenchmark: { listings: 3, publishedListings: 1, publishedRate: 33.3, averageReadiness: 70 },
  templates: [{
    templateId: 'events.party-rentals', templateVersion: 1, title: 'Party Rentals',
    listings: 2, publishedListings: 1, publishedRate: 50, averageReadiness: 86,
    readinessVsNoTemplate: 16, checkout: {
      orders: 1, listings: 1,
      rails: { hosted_checkout: 0, protocol_checkout: 1, recurring_service: 0, staged_settlement: 0, resource_reservation: 0 },
    },
    negotiated: { deals: 1, listings: 1 },
  }],
})))

vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: requireAdmin }))
vi.mock('../../../lib/server/commerce-template-outcomes', () => ({ getCommerceTemplateOutcomeSnapshot: getSnapshot }))

import AdminTemplateOutcomesPage from './page'

describe('AdminTemplateOutcomesPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('authorizes before rendering separate, non-causal template outcomes', async () => {
    render(await AdminTemplateOutcomesPage())
    expect(requireAdmin).toHaveBeenCalledWith('/admin/templates')
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(getSnapshot.mock.invocationCallOrder[0])
    expect(screen.getByRole('heading', { name: 'Template outcomes' })).toBeInTheDocument()
    expect(screen.getByText('Party Rentals')).toBeInTheDocument()
    expect(screen.getByText('+16 points vs no recorded template')).toBeInTheDocument()
    expect(screen.getByText('Agent protocols 1')).toBeInTheDocument()
    expect(screen.getByText(/directional cohort results/i)).toBeInTheDocument()
  })

  it('does not render false checkout zeros when that source is unavailable', async () => {
    getSnapshot.mockResolvedValueOnce({
      ...(await getSnapshot()),
      warnings: ['Live checkout outcomes are unavailable. Checkout values are not shown as zero.'],
      sources: { ...(await getSnapshot()).sources, checkout: { available: false, truncated: false } },
    })
    render(await AdminTemplateOutcomesPage())
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(screen.getByText(/Checkout values are not shown as zero/)).toBeInTheDocument()
  })
})
