// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../test/dom'
import { VisualBuilderSection } from './VisualBuilderSection'

vi.mock('../AICoPilot', () => ({ AICoPilot: () => <div>AI Co-Pilot surface</div> }))
vi.mock('../VisualOfferBuilder', () => ({
  VisualOfferBuilder: ({ aiFeaturesEnabled, negotiationEnabled }: { aiFeaturesEnabled?: boolean; negotiationEnabled?: boolean }) => (
    <div>Offer builder AI: {String(aiFeaturesEnabled)} · Negotiation: {String(negotiationEnabled)}</div>
  ),
}))
vi.mock('./RecurringServiceManager', () => ({ RecurringServiceManager: () => null }))
vi.mock('./ConditionalFulfillmentManager', () => ({ ConditionalFulfillmentManager: () => null }))

function editor(aiFeaturesEnabled: boolean, negotiationEnabled: boolean) {
  return {
    aiFeaturesEnabled,
    negotiationEnabled,
    aiBusy: false,
    name: 'Acme',
    audience: 'Buyers',
    servicesOffers: [],
    productsOffers: [],
    parsedServices: [],
    parsedProducts: [],
    page: { llm_opt_in: true },
    id: 'page-1',
    setServicesOffers: vi.fn(),
    setProductsOffers: vi.fn(),
    setServices: vi.fn(),
    setProducts: vi.fn(),
    setMessage: vi.fn(),
    optimizeOffersWithAI: vi.fn(),
    enhanceAllOffers: vi.fn(),
  } as any
}

describe('VisualBuilderSection AI entitlement', () => {
  it('hides every optimization action and Co-Pilot when the owner lacks Launch AI features', () => {
    render(<VisualBuilderSection e={editor(false, false)} />)

    expect(screen.queryByRole('button', { name: 'AI Optimize All' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enhance All' })).not.toBeInTheDocument()
    expect(screen.queryByText('AI Co-Pilot surface')).not.toBeInTheDocument()
    expect(screen.getAllByText('Offer builder AI: false · Negotiation: false')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Launch/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/dashboard\/billing\?plan=launch$/),
    )
  })

  it('renders optimization actions only for an entitled page owner', () => {
    render(<VisualBuilderSection e={editor(true, true)} />)

    expect(screen.getByRole('button', { name: 'AI Optimize All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enhance All' })).toBeInTheDocument()
    expect(screen.getByText('AI Co-Pilot surface')).toBeInTheDocument()
    expect(screen.getAllByText('Offer builder AI: true · Negotiation: true')).toHaveLength(2)
  })

  it('passes negotiation access independently from Launch AI access', () => {
    render(<VisualBuilderSection e={editor(true, false)} />)

    expect(screen.getAllByText('Offer builder AI: true · Negotiation: false')).toHaveLength(2)
  })
})
