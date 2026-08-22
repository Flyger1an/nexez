// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { track } from '@vercel/analytics'
import { SimulatorTeaser } from './SimulatorTeaser'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

const mockedTrack = vi.mocked(track)

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
  decisionPath: [
    { key: 'intent', status: 'understood', label: 'Booking intent', detail: 'Buyer request classified without changing its service category.' },
    { key: 'supply', status: 'checked', label: 'Live marketplace checked', detail: 'No matching published provider is available yet.' },
    { key: 'commerce', status: 'reference', label: 'Commerce behavior understood', detail: 'Private Chef is the closest non-purchasable reference.' },
    { key: 'action', status: 'protected', label: 'Real merchant required', detail: 'No price, availability, inventory, or booking was invented.' },
  ],
  llmEnhanced: false,
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
  decisionPath: [
    { key: 'intent', status: 'understood', label: 'Booking intent', detail: 'Buyer request classified without changing its service category.' },
    { key: 'supply', status: 'related', label: 'Related marketplace supply', detail: 'Austin Event Planners' },
    { key: 'commerce', status: 'checked', label: 'Requirement coverage compared', detail: 'The offer does not establish the complete request.' },
    { key: 'action', status: 'verify', label: 'Merchant confirmation required', detail: 'Verify unsupported requirements.' },
  ],
  llmEnhanced: false,
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
  decisionPath: [
    { key: 'intent', status: 'understood', label: 'Service request', detail: 'Mobile notary' },
    { key: 'supply', status: 'checked', label: 'Live marketplace searched', detail: 'No matching published provider is available yet.' },
    { key: 'commerce', status: 'checked', label: 'Commerce Library searched', detail: 'No trustworthy reference scenario covers this request yet.' },
    { key: 'action', status: 'protected', label: 'Buyer intent preserved', detail: 'Nexez did not redirect the request to an unrelated service.' },
  ],
  llmEnhanced: false,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

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
    expect(screen.getByRole('list', { name: 'Nexez decision path' })).toBeInTheDocument()
    expect(screen.getByText('Commerce behavior understood')).toBeInTheDocument()
    expect(screen.getByText('Real merchant required')).toBeInTheDocument()
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
    expect(screen.getByText('Related marketplace supply')).toBeInTheDocument()
    expect(screen.getByText('Merchant confirmation required')).toBeInTheDocument()
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

    await waitFor(() => expect(screen.getByText('Request understood')).toBeInTheDocument())
    expect(screen.getAllByText('Service request')).toHaveLength(2)
    expect(screen.getByText('Request understood')).toBeInTheDocument()
    expect(screen.getByText('coverage expanding')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mobile notary' })).toBeInTheDocument()
    expect(screen.getByText(/coverage for this category is still growing/)).toBeInTheDocument()
    expect(screen.getByText('Live marketplace searched')).toBeInTheDocument()
    expect(screen.getByText('Commerce Library searched')).toBeInTheDocument()
    expect(screen.getByText('Buyer intent preserved')).toBeInTheDocument()
    expect(screen.queryByText(/Mobile Auto Detailing|vehicle class/i)).not.toBeInTheDocument()
    expect(screen.queryByText('no match')).not.toBeInTheDocument()
    expect(screen.queryByText('Agent actions')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'What agents parse' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'List this service' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore live marketplace →' })).toHaveAttribute('href', '/discovery')

    fireEvent.click(screen.getByRole('button', { name: 'Refine request' }))
    expect(screen.getByPlaceholderText('Ask Nexez to find a service…')).toHaveFocus()
    expect(mockedTrack).toHaveBeenCalledWith('simulator_refine', { mode: 'coverage_gap' })

    expect(mockedTrack).toHaveBeenCalledWith('simulator_submit', {
      source: 'typed',
      query_length: 'Find a mobile notary'.length,
    })
    expect(mockedTrack).toHaveBeenCalledWith('simulator_result', expect.objectContaining({
      source: 'typed',
      mode: 'coverage_gap',
      intent: 'overview',
      live_match: false,
      llm_enhanced: false,
    }))
    expect(JSON.stringify(mockedTrack.mock.calls)).not.toContain('Find a mobile notary')
  })

  it('does not ask again for location or timing already present in the request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...coverageGapResponse,
        naturalLanguage: 'Nexez understood your request as “Mobile notary in Dallas this weekend.”',
        understoodRequest: {
          ...coverageGapResponse.understoodRequest,
          label: 'Mobile notary in Dallas this weekend',
        },
      }),
    })))

    render(<SimulatorTeaser />)
    fireEvent.change(screen.getByPlaceholderText('Ask Nexez to find a service…'), {
      target: { value: 'Find a mobile notary in Dallas this weekend' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))

    await waitFor(() => expect(screen.getByText('Location and timing recognized')).toBeInTheDocument())
    expect(screen.getByText(/Add any must-have details, budget, or flexibility/)).toBeInTheDocument()
    expect(screen.queryByText(/Add a (?:city|location) and preferred timing/)).not.toBeInTheDocument()
  })
})
