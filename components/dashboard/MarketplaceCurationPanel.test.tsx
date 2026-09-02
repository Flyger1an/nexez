// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import type { MarketplaceCurationQueue, MarketplaceCurationQueueItem } from '../../lib/marketplace-curation'
import { MarketplaceCurationPanel } from './MarketplaceCurationPanel'

function item(overrides: Partial<MarketplaceCurationQueueItem> = {}): MarketplaceCurationQueueItem {
  return {
    page: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Northstar Strategy',
      slug: 'northstar-strategy',
      description: 'Strategy for software companies.',
      website_url: 'https://northstar.example',
      cta_url: 'https://northstar.example/book',
      cta_label: 'Book',
      audience: 'Software companies',
      location: 'Remote / worldwide',
      contact_email: 'hello@northstar.example',
      industry: 'Business consulting',
      products: [],
      services: [{ name: 'Strategy sprint', description: 'Two weeks', price: '$1,500', url: '' }],
      faqs: [{ question: 'How long?', answer: 'Two weeks.' }],
      is_published: true,
      marketplace_discoverable: true,
    },
    decision: {
      pageId: '11111111-1111-4111-8111-111111111111',
      status: 'unreviewed',
      decisionReason: null,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      certifiedAt: null,
      updatedAt: null,
    },
    assessment: {
      version: 1,
      assessedAt: '2026-07-21T12:00:00.000Z',
      readiness: 100,
      trust: 60,
      offerCount: 1,
      pricedOfferCount: 1,
      actionableOfferCount: 1,
      blockerCount: 0,
      warningCount: 0,
      suggestedStatus: 'candidate',
      flags: [],
    },
    duplicateNameCount: 1,
    ...overrides,
  }
}

function queue(items: MarketplaceCurationQueueItem[]): MarketplaceCurationQueue {
  return {
    generatedAt: '2026-07-21T12:00:00.000Z',
    available: true,
    items,
    summary: {
      total: items.length,
      unreviewed: items.filter((entry) => entry.decision.status === 'unreviewed').length,
      candidate: items.filter((entry) => entry.decision.status === 'candidate').length,
      certified: items.filter((entry) => entry.decision.status === 'certified').length,
      excluded: items.filter((entry) => entry.decision.status === 'excluded').length,
      blockers: items.reduce((sum, entry) => sum + entry.assessment.blockerCount, 0),
      warnings: items.reduce((sum, entry) => sum + entry.assessment.warningCount, 0),
    },
  }
}

describe('MarketplaceCurationPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders launch supply and exposes review controls for a selected listing', () => {
    render(<MarketplaceCurationPanel queue={queue([item()])} />)
    expect(screen.getByRole('heading', { name: 'Marketplace curation' })).toBeInTheDocument()
    expect(screen.getByText('Published listings')).toBeInTheDocument()
    expect(screen.getByText('Launch merchants')).toBeInTheDocument()
    expect(screen.getByText('of 50 required for Discovery')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Northstar Strategy/ }))
    expect(screen.getByLabelText('Review status')).toHaveValue('unreviewed')
    expect(screen.getByText(/No automated quality blockers were found/)).toBeInTheDocument()
  })

  it('saves an exclusion reason through the admin route and reports success', async () => {
    const original = item()
    const saved = item({
      page: { ...original.page, marketplace_discoverable: false },
      decision: { ...original.decision, status: 'excluded', decisionReason: 'Internal QA listing' },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, item: saved }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    render(<MarketplaceCurationPanel queue={queue([original])} />)
    fireEvent.click(screen.getByRole('button', { name: /Northstar Strategy/ }))
    fireEvent.change(screen.getByLabelText('Review status'), { target: { value: 'excluded' } })
    fireEvent.change(screen.getByLabelText(/Decision reason/), { target: { value: 'Internal QA listing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Northstar Strategy is now excluded.'))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/marketplace-curation', expect.objectContaining({ method: 'PATCH' }))
  })

  it('renders a clear dormant state when the server-only ledger is unavailable', () => {
    render(<MarketplaceCurationPanel queue={{ ...queue([]), available: false }} />)
    expect(screen.getByText('Curation data is unavailable')).toBeInTheDocument()
  })
})
