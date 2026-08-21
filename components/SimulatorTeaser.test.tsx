// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { SimulatorTeaser } from './SimulatorTeaser'

const simulationResponse = {
  success: true,
  mode: 'simulation',
  noMatch: true,
  intent: 'booking',
  intentLabel: 'Booking intent',
  naturalLanguage: 'I couldn’t find a live Nexez provider for this request. A real match needs more buyer details.',
  readiness: 0,
  confidence: null,
  offers: [],
  agentActions: [
    'Recognize the request as closest to “Private Chef”',
    'Collect buyer details: preferred date and time, guest count, dietary needs, service location, and budget',
  ],
  matchedBusiness: null,
  simulation: {
    active: true,
    source: 'commerce-library',
    label: 'SIMULATION',
    title: 'Private Chef',
    serviceType: 'a custom-quote service',
    explanation: 'I couldn’t find a live Nexez provider for this request. A real match needs more buyer details.',
    disclaimer: 'This Commerce Library scenario is reference behavior, not a real merchant, available inventory, price, or booking.',
    detailsToConfirm: ['preferred date and time', 'guest count', 'dietary needs', 'service location', 'budget'],
    nextSteps: [],
  },
}

const partialMatchResponse = {
  success: true,
  mode: 'partial_match',
  noMatch: false,
  intent: 'booking',
  intentLabel: 'Booking intent',
  naturalLanguage: 'I found Austin Event Planners as related marketplace supply, but it only matches part of this request.',
  readiness: 72,
  confidence: null,
  offers: [{
    key: 'services-0',
    type: 'service',
    name: 'General Event Planning',
    price: 'Custom quote',
    description: 'Planning support for local events.',
    checkoutUrl: null,
    bestMatch: false,
  }],
  agentActions: ['Confirm unsupported requirements with the merchant before presenting fit.'],
  matchedBusiness: {
    name: 'Austin Event Planners',
    slug: 'austin-event-planners',
    url: 'https://nexez.test/austin-event-planners',
    matchType: 'partial',
    offer: { key: 'services-0', name: 'General Event Planning', price: 'Custom quote', checkoutUrl: null },
  },
  simulation: null,
}

const coverageGapResponse = {
  success: true,
  mode: 'coverage_gap',
  noMatch: true,
  intent: 'overview',
  intentLabel: 'Service request',
  naturalLanguage: 'Nexez understood your request as “Mobile notary.” It checked the live marketplace and Commerce Library, but coverage for this category is still growing. Your intent stays intact—Nexez won’t redirect you to an unrelated service.',
  readiness: 0,
  confidence: null,
  offers: [],
  agentActions: [
    'Keep the request anchored to “Find a mobile notary”',
    'Do not substitute a different service category',
  ],
  matchedBusiness: null,
  simulation: null,
  understoodRequest: {
    label: 'Mobile notary',
    marketplaceChecked: true,
    commerceLibraryChecked: true,
    intentPreserved: true,
    coverageStatus: 'growing',
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('SimulatorTeaser', () => {
  it('renders a simulation as buyer guidance without a technical reference view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => simulationResponse,
    })))

    render(<SimulatorTeaser />)
    fireEvent.change(screen.getByPlaceholderText('Ask Nexez to find a service…'), {
      target: { value: 'Find a private chef this weekend' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))

    await waitFor(() => expect(screen.getByText('Simulation · Private Chef')).toBeInTheDocument())
    expect(screen.getByText('reference match only')).toBeInTheDocument()
    expect(screen.queryByText('Reference scenario')).not.toBeInTheDocument()
    expect(screen.queryByText(/events\.private-chef|QUOTE_REQUIRED|capabilityTags|gapSignals|matchedTerms/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Details to confirm' }))
    expect(screen.getByText('Buyer details needed for a real match')).toBeInTheDocument()
    expect(screen.getByText('preferred date and time')).toBeInTheDocument()
    expect(screen.getByText('guest count')).toBeInTheDocument()
    expect(screen.getByText('dietary needs')).toBeInTheDocument()
    expect(screen.getByText('budget')).toBeInTheDocument()
    expect(screen.queryByText(/events\.private-chef|QUOTE_REQUIRED|capabilityTags|gapSignals|matchedTerms/)).not.toBeInTheDocument()
  })

  it('presents related supply as a partial match instead of a best match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => partialMatchResponse,
    })))

    render(<SimulatorTeaser />)
    fireEvent.change(screen.getByPlaceholderText('Ask Nexez to find a service…'), {
      target: { value: 'Find a luxury wedding planner in Austin' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))

    await waitFor(() => expect(screen.getByText('Related marketplace · Austin Event Planners')).toBeInTheDocument())
    expect(screen.getByText('partial match')).toBeInTheDocument()
    expect(screen.queryByText(/match confidence/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'What agents parse' }))
    expect(screen.getByText('Related offers to verify')).toBeInTheDocument()
    expect(screen.getByText('Related offer')).toBeInTheDocument()
    expect(screen.queryByText('Best match')).not.toBeInTheDocument()
  })

  it('renders an uncovered service as understood without an unrelated simulation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => coverageGapResponse,
    })))

    render(<SimulatorTeaser />)
    fireEvent.change(screen.getByPlaceholderText('Ask Nexez to find a service…'), {
      target: { value: 'Find a mobile notary' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))

    await waitFor(() => expect(screen.getByText('Service request')).toBeInTheDocument())
    expect(screen.getByText('Request understood')).toBeInTheDocument()
    expect(screen.getByText('coverage expanding')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mobile notary' })).toBeInTheDocument()
    expect(screen.getByText(/coverage for this category is still growing/)).toBeInTheDocument()
    expect(screen.getByText('No published provider yet')).toBeInTheDocument()
    expect(screen.getByText('No reference scenario yet')).toBeInTheDocument()
    expect(screen.getByText('No unrelated substitute')).toBeInTheDocument()
    expect(screen.queryByText(/Mobile Auto Detailing|vehicle class/i)).not.toBeInTheDocument()
    expect(screen.queryByText('no match')).not.toBeInTheDocument()
    expect(screen.queryByText('Agent actions')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'What agents parse' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'List this service' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore live marketplace →' })).toHaveAttribute('href', '/discovery')

    fireEvent.click(screen.getByRole('button', { name: 'Refine request' }))
    expect(screen.getByPlaceholderText('Ask Nexez to find a service…')).toHaveFocus()
  })
})
