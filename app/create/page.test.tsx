// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import CreatePage from './page'
import { NEXEZ_INDUSTRIES } from '../../lib/industry-catalog'
import { agentRuntimeUrl, appUrl } from '../../lib/site'
import { PlanProvider } from '../../components/billing/PlanProvider'
import { getPlanFeatureEntitlements, getSerializablePlanLimits } from '../../lib/billing'

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: supabaseMocks.getUser },
    from: () => ({ insert: supabaseMocks.insert }),
  }),
}))

function resetSupabaseMocks() {
  routerMock.push.mockReset()
  supabaseMocks.getUser.mockReset()
  supabaseMocks.insert.mockReset()
  supabaseMocks.select.mockReset()
  supabaseMocks.single.mockReset()

  supabaseMocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
  supabaseMocks.insert.mockReturnValue({ select: supabaseMocks.select })
  supabaseMocks.select.mockReturnValue({ single: supabaseMocks.single })
  supabaseMocks.single.mockResolvedValue({ data: { id: 'page-1', slug: 'test-page' }, error: null })
}

function guidedImportPayload() {
  const structuredOffers = Array.from({ length: 12 }, (_, index) => ({
    name: `Agent Offer ${index + 1}`,
    price: `$${(index + 1) * 100}`,
    description: `Agent Offer ${index + 1} is ready for agent parsing. Next step: book appointments.`,
    url: `https://example.com/services/agent-offer-${index + 1}`,
    confidence: 0.84,
    metadata: {
      provenance: {
        label: index % 2 === 0 ? 'Services schema' : 'Pricing page',
        method: index % 2 === 0 ? 'schema.org JSON-LD' : 'HTML extraction',
        url: 'https://example.com/services',
        type: index % 2 === 0 ? 'schema_org' : 'heuristic',
      },
    },
  }))

  return {
    suggestedPage: {
      name: 'QA Strategy Studio',
      description: 'AI-ready services for founders.',
      website_url: 'https://example.com/services',
      cta_url: 'https://example.com/book',
      cta_label: 'Book appointments',
      industry: 'Consulting & Strategy',
      audience: 'Founders evaluating AI-ready services',
      location: 'Remote',
    },
    structuredOffers,
    pagesAnalyzed: 5,
    confidence: 0.88,
    readiness: { score: 91, strengths: ['Structured offers'], gaps: ['Confirm featured offers'] },
    clarifyingQuestions: [{ id: 'featured-offers', field: 'offers', question: 'Which offers should be featured first?', why: 'Agents parse prioritized offers faster.' }],
    sources: [{ url: 'https://example.com/services', label: 'Services page', type: 'input_url', method: 'HTML crawl' }],
    reviewNotes: ['Imported 12 offers from controlled QA data.'],
    aiStatus: {
      configured: false,
      attempted: false,
      used: false,
      status: 'deterministic',
      provider: 'openai.com',
      model: 'gpt-4o-mini',
      reason: 'LLM_API_KEY is not configured.',
    },
    aiAssisted: false,
    message: 'Mock import complete',
  }
}

type RefinementScenario = {
  name: string
  url: string
  buyer: string
  offerFocus: string
  industry: string
  question: string
  answer: string
  initialOffer: string
  refinedOffer: string
  refinedDescription: string
}

const refinementScenarios: RefinementScenario[] = [
  {
    name: 'mobile IV therapy',
    url: 'https://example.com/mobile-iv',
    buyer: 'busy executives and event hosts',
    offerFocus: 'hydration drips, recovery visits, wellness memberships',
    industry: 'Mobile IV Therapy',
    question: 'Which clients should agents prioritize first?',
    answer: 'Prioritize executives, wedding parties, and travelers who need same-day mobile appointments.',
    initialOffer: 'Mobile Hydration Visit',
    refinedOffer: 'Executive Mobile Hydration Visit',
    refinedDescription: 'Same-day mobile IV hydration for executives, wedding parties, and travelers with clear booking instructions.',
  },
  {
    name: 'immigration law',
    url: 'https://example.com/immigration-law',
    buyer: 'founders and skilled professionals',
    offerFocus: 'visa consultations, case review, filing packages',
    industry: 'Immigration Law',
    question: 'Which matter type should the page lead with?',
    answer: 'Lead with O-1 and EB-2 NIW consultations for founders and skilled professionals.',
    initialOffer: 'Immigration Strategy Consultation',
    refinedOffer: 'O-1 and EB-2 NIW Strategy Consultation',
    refinedDescription: 'Focused visa strategy review for founders and skilled professionals comparing O-1 and EB-2 NIW options.',
  },
  {
    name: 'pressure washing',
    url: 'https://example.com/pressure-washing',
    buyer: 'property managers and homeowners',
    offerFocus: 'driveway cleaning, storefront cleaning, recurring maintenance',
    industry: 'Pressure Washing',
    question: 'What should agents know before requesting a quote?',
    answer: 'Ask for property type, square footage, surface material, and preferred service window.',
    initialOffer: 'Exterior Cleaning Quote',
    refinedOffer: 'Property Manager Exterior Cleaning Quote',
    refinedDescription: 'Agent-ready quote request for pressure washing with property type, surface material, square footage, and timing captured up front.',
  },
]

function guidedImportPayloadForScenario(scenario: RefinementScenario, refined = false) {
  return {
    suggestedPage: {
      name: refined ? `${scenario.industry} Agent Page` : `${scenario.industry} Draft`,
      description: refined
        ? `${scenario.industry} offers tuned for ${scenario.buyer}. ${scenario.answer}`
        : `${scenario.industry} services for ${scenario.buyer}.`,
      website_url: scenario.url,
      cta_url: `${scenario.url}/book`,
      cta_label: scenario.industry === 'Pressure Washing' ? 'Request quote' : 'Book consultation',
      industry: scenario.industry,
      audience: scenario.buyer,
      location: 'Remote or local by appointment',
    },
    structuredOffers: [
      {
        name: refined ? scenario.refinedOffer : scenario.initialOffer,
        price: scenario.industry === 'Pressure Washing' ? 'Custom quote' : '$250',
        description: refined ? scenario.refinedDescription : `${scenario.initialOffer} for ${scenario.buyer}.`,
        url: `${scenario.url}/offer`,
        confidence: refined ? 0.93 : 0.82,
        metadata: {
          provenance: {
            label: 'Scenario services page',
            method: 'Guided import simulation',
            url: scenario.url,
            type: 'heuristic',
          },
        },
      },
    ],
    pagesAnalyzed: 4,
    confidence: refined ? 0.92 : 0.81,
    readiness: {
      score: refined ? 92 : 78,
      strengths: refined ? ['Clarifying answer applied', 'Agent action is clear'] : ['Detected service offer'],
      gaps: refined ? [] : ['Answer the follow-up to tighten priority buyers'],
    },
    clarifyingQuestions: [{ id: `${scenario.name.replace(/\s+/g, '-')}-priority`, field: 'offers', question: scenario.question, why: 'Agents convert faster when the best-fit action is explicit.' }],
    sources: [{ url: scenario.url, label: 'Scenario landing page', type: 'input_url', method: 'Guided import simulation' }],
    reviewNotes: refined ? [`Refined with answer: ${scenario.answer}`] : [`Initial draft for ${scenario.name}.`],
    aiStatus: refined
      ? {
          configured: true,
          attempted: true,
          used: true,
          status: 'structured_ai',
          provider: 'llm.example.com',
          model: 'agent-draft-v1',
          reason: 'AI extraction returned usable structured data.',
        }
      : {
          configured: false,
          attempted: false,
          used: false,
          status: 'deterministic',
          provider: 'openai.com',
          model: 'gpt-4o-mini',
          reason: 'LLM_API_KEY is not configured.',
        },
    aiAssisted: refined,
    message: refined ? 'Refined draft ready' : 'Mock import complete',
  }
}

/** Only the guided-import calls - other components on /create (e.g. the intake
 *  panel's resume check during the fork's first frame) may fetch too, and these
 *  suites assert the IMPORT contract, not total network traffic. */
function importCalls(fetchMock: ReturnType<typeof vi.fn>): Array<[RequestInfo | URL, RequestInit]> {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/tools/import-site')) as Array<
    [RequestInfo | URL, RequestInit]
  >
}

describe('CreatePage guided import review', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    // These suites exercise the form wizard. /create now forks to the intake
    // interview by default (spec §6) - enter through the real fork logic.
    window.history.replaceState({}, '', '/create?mode=form')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('makes the 8-of-12 preview explicit and can show/apply every detected offer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(guidedImportPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    render(<CreatePage />)

    fireEvent.change(screen.getByLabelText('Business page URL'), { target: { value: 'https://example.com/services' } })
    fireEvent.change(screen.getByLabelText('Best-fit buyer'), { target: { value: 'founders' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }))

    expect(await screen.findByText(/Showing first 8 of 12 detected offers/i)).toBeInTheDocument()
    expect(screen.getByText(/including hidden ones/i)).toBeInTheDocument()
    expect(screen.queryByText('Agent Offer 12')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show all 12' }))
    expect(await screen.findByText('Agent Offer 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show top 8' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply to builder' }))
    await waitFor(() => expect(screen.getByText(/Guided import applied. 12 offers are ready/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue('Agent Offer 12')).toBeInTheDocument()
  })

  it('sends answered clarifying questions when refining an import draft', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(guidedImportPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<CreatePage />)

    fireEvent.change(screen.getByLabelText('Business page URL'), { target: { value: 'https://example.com/services' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }))

    const answerField = await screen.findByLabelText('Answer: Which offers should be featured first?')
    fireEvent.change(answerField, { target: { value: 'Feature implementation retainers before audits.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Refine draft' }))

    await waitFor(() => expect(importCalls(fetchMock)).toHaveLength(2))
    const secondCall = importCalls(fetchMock)[1]
    const secondBody = JSON.parse(String(secondCall[1]?.body || '{}'))
    expect(secondBody.clarifyingAnswers).toEqual([
      {
        id: 'featured-offers',
        field: 'offers',
        question: 'Which offers should be featured first?',
        answer: 'Feature implementation retainers before audits.',
      },
    ])
    expect(await screen.findByText(/Refined draft ready/i)).toBeInTheDocument()
  })

  it('uses a freeform industry field with autocomplete suggestions', () => {
    render(<CreatePage />)

    const industryInput = screen.getByLabelText('Industry or niche')
    expect(industryInput).toHaveAttribute('list', 'nexez-industry-suggestions')
    fireEvent.change(industryInput, { target: { value: 'Mobile IV Therapy' } })
    expect(screen.getByDisplayValue('Mobile IV Therapy')).toBeInTheDocument()

    const options = document.querySelectorAll('#nexez-industry-suggestions option')
    expect(options).toHaveLength(NEXEZ_INDUSTRIES.length)
    expect(Array.from(options).some((option) => option.getAttribute('value') === 'Immigration Law')).toBe(true)
  })

  it('applies a reviewed catalog file to the visual builder and business fields', async () => {
    const { container } = render(<CreatePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Import catalog file' }))
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: {
        files: [new File([
          'type,name,price,description,business_name,website_url\nservice,Agent Audit,$180,Readiness review,Acme Lab,https://acme.example',
        ], 'catalog.csv', { type: 'text/csv' })],
      },
    })

    expect(await screen.findByText('catalog.csv')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed import' }))

    expect(await screen.findByText(/Imported 1 services, 0 products, and 0 FAQs from catalog.csv after review/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://acme.example')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Agent Audit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByDisplayValue('Acme Lab')).toBeInTheDocument()
  })

  it('does not expose paid AI optimization before an owner plan is resolved', () => {
    render(<CreatePage />)

    expect(screen.queryByRole('button', { name: 'Agent Optimize' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'Manual Draft' } })
    fireEvent.change(screen.getByLabelText('Short Description'), { target: { value: 'Manual seller copy.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.queryByRole('button', { name: 'Enhance All' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Optimize Offers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enhance' })).not.toBeInTheDocument()
    expect(screen.queryByText('AI Co-Pilot')).not.toBeInTheDocument()
    expect(screen.getByText(/AI Optimize, bulk rewrite, and Co-Pilot tools unlock on Launch/i)).toBeInTheDocument()
  })

  it('keeps catalog file import available while gating premium imports below Pro', () => {
    render(<CreatePage />)

    expect(screen.getByRole('button', { name: 'Import catalog file' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import Stripe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import Calendly' })).not.toBeInTheDocument()
    expect(screen.getByText('Stripe & Calendly imports')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Upgrade to Pro/ })).toHaveAttribute('href', appUrl('/dashboard/billing?plan=pro'))
  })

  it('shows Stripe and Calendly import forms when the resolved plan allows integrations', () => {
    render(
      <PlanProvider
        entitlements={{
          planId: 'pro',
          features: getPlanFeatureEntitlements('pro'),
          limits: getSerializablePlanLimits('pro'),
        }}
      >
        <CreatePage />
      </PlanProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Import Stripe' }))
    expect(screen.getByText('Stripe Product or Price Import')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import Calendly' }))
    expect(screen.getByText('Calendly Bookings Import')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import catalog file' })).toBeInTheDocument()
  })

  it.each(refinementScenarios)('runs the refinement loop for $name offers', async (scenario) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'))
      const hasClarifyingAnswers = Array.isArray(body.clarifyingAnswers) && body.clarifyingAnswers.length > 0

      return new Response(JSON.stringify(guidedImportPayloadForScenario(scenario, hasClarifyingAnswers)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CreatePage />)

    fireEvent.change(screen.getByLabelText('Business page URL'), { target: { value: scenario.url } })
    fireEvent.change(screen.getByLabelText('Best-fit buyer'), { target: { value: scenario.buyer } })
    fireEvent.change(screen.getByLabelText('Offer focus'), { target: { value: scenario.offerFocus } })
    fireEvent.change(screen.getByLabelText('Industry or niche'), { target: { value: scenario.industry } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }))

    expect(await screen.findByText(scenario.initialOffer)).toBeInTheDocument()

    const answerField = await screen.findByLabelText(`Answer: ${scenario.question}`)
    fireEvent.change(answerField, { target: { value: scenario.answer } })
    fireEvent.click(screen.getByRole('button', { name: 'Refine draft' }))

    expect(await screen.findByText(scenario.refinedOffer)).toBeInTheDocument()
    expect(await screen.findByText(/AI extraction used agent-draft-v1/i)).toBeInTheDocument()
    await waitFor(() => expect(importCalls(fetchMock)).toHaveLength(2))

    const firstCall = importCalls(fetchMock)[0]
    const firstBody = JSON.parse(String(firstCall[1]?.body || '{}'))
    expect(firstBody.industry).toBe(scenario.industry)
    expect(firstBody.offerFocus).toBe(scenario.offerFocus)

    const secondCall = importCalls(fetchMock)[1]
    const secondBody = JSON.parse(String(secondCall[1]?.body || '{}'))
    expect(secondBody.clarifyingAnswers).toEqual([
      {
        id: `${scenario.name.replace(/\s+/g, '-')}-priority`,
        field: 'offers',
        question: scenario.question,
        answer: scenario.answer,
      },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Apply to builder' }))
    await waitFor(() => expect(screen.getByText(/Guided import applied. 1 offer is ready/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue(scenario.refinedOffer)).toBeInTheDocument()
    expect(screen.getByDisplayValue(scenario.refinedDescription)).toBeInTheDocument()
  })

  it('opens the public agent page in a new tab and returns the creator to the dashboard editor after publish', async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    supabaseMocks.single.mockResolvedValue({ data: { id: 'page-123', slug: 'acme-agent-page' }, error: null })

    const tab = {
      closed: false,
      close: vi.fn(),
      opener: {} as Window | null,
      document: { title: '', body: { innerHTML: '' } },
      location: { href: '' },
    }
    const openMock = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)

    render(<CreatePage />)

    fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'Acme Agent Page' } })
    fireEvent.change(screen.getByLabelText('Short Description'), { target: { value: 'Agent-ready service page for Acme.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(screen.getByLabelText('Main website'), { target: { value: 'https://acme.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish listing' }))

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/dashboard/page-123?created=1&public=acme-agent-page'))

    expect(openMock).toHaveBeenCalledWith('', '_blank')
    expect(tab.opener).toBeNull()
    expect(tab.location.href).toBe(agentRuntimeUrl('/acme-agent-page'))
    expect(tab.close).not.toHaveBeenCalled()
    expect(supabaseMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      owner_id: 'user-1',
      name: 'Acme Agent Page',
      slug: 'acme-agent-page',
      is_published: true,
    }))
  })

  it('offers Save as draft inline when the publish limit is hit, and saving creates a draft + opens the editor', async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    supabaseMocks.single
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23514', message: 'Published page limit reached for your plan (1 page(s)).', hint: 'Upgrade to publish more.' },
      })
      .mockResolvedValueOnce({ data: { id: 'page-draft', slug: 'acme-agent-page' }, error: null })

    vi.spyOn(window, 'open').mockReturnValue(null)
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(<CreatePage />)

    fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'Acme Agent Page' } })
    fireEvent.change(screen.getByLabelText('Short Description'), { target: { value: 'Agent-ready service page for Acme.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(screen.getByLabelText('Main website'), { target: { value: 'https://acme.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish listing' }))

    // Limit surfaces inline with a "Save as draft" action (no native confirm/alert).
    const draftButton = await screen.findByRole('button', { name: 'Save as draft' })
    expect(screen.getByText('Published page limit reached for your plan (1 page(s)). Upgrade to publish more.')).toBeTruthy()
    fireEvent.click(draftButton)

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/dashboard/page-draft?created=1&draft=1'))
    expect(alertMock).not.toHaveBeenCalled()
    expect(supabaseMocks.insert).toHaveBeenCalledTimes(2)
    expect(supabaseMocks.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ is_published: true }))
    expect(supabaseMocks.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ is_published: false }))
  })

  it('creates nothing while the limit is shown until the owner chooses Save as draft', async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    supabaseMocks.single.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'Published page limit reached for your plan (1 page(s)).', hint: 'Upgrade to publish more.' },
    })

    vi.spyOn(window, 'open').mockReturnValue(null)
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(<CreatePage />)

    fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'Acme Agent Page' } })
    fireEvent.change(screen.getByLabelText('Short Description'), { target: { value: 'Agent-ready service page for Acme.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(screen.getByLabelText('Main website'), { target: { value: 'https://acme.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish listing' }))

    // The limit is inline (not via alert); the page is only created on the user's
    // explicit "Save as draft" choice - which we don't make here.
    expect(await screen.findByText('Published page limit reached for your plan (1 page(s)). Upgrade to publish more.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeTruthy()
    expect(alertMock).not.toHaveBeenCalled()
    expect(supabaseMocks.insert).toHaveBeenCalledTimes(1)
    expect(routerMock.push).not.toHaveBeenCalled()
  })
})
