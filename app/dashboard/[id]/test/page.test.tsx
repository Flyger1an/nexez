// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../../test/dom'

const listing = {
  id: 'page-1',
  owner_id: 'owner-1',
  name: 'Acme Strategy',
  slug: 'acme',
  description: 'Strategy services for founders',
  website_url: 'https://acme.test',
  cta_url: 'https://acme.test/book',
  cta_label: 'Book',
  audience: 'Founders',
  location: 'Remote',
  contact_email: 'hello@acme.test',
  industry: 'Consulting',
  prefer_original_site: false,
  products: [],
  services: [{ name: 'Strategy Session', description: 'A focused call', price: '$250', url: '' }],
  faqs: [{ question: 'When?', answer: 'This week.' }],
  is_published: false,
  llm_opt_in: false,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
}

vi.mock('../../../../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } } })) },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: vi.fn(async () => ({ data: listing, error: null })) }),
        }),
      }),
    }),
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

import AgentSimulatorPage from './page'

const simulationRun = {
  id: 'run-1',
  ownerId: 'owner-1',
  pageId: 'page-1',
  pageSlug: 'acme',
  query: 'Find strategy help',
  engineVersion: 'nexez.agent-lab.v2',
  executionMode: 'deterministic',
  readiness: 82,
  result: {
    query: 'Find strategy help',
    results: [{
      agent: 'ChatGPT',
      schema: { page: { name: 'run-marker' }, suggestedActions: ['Open the booking page'] },
      verdict: {
        agent: 'ChatGPT',
        lens: 'Action confidence',
        stance: 'recommend',
        headline: 'The listing supports a direct next step.',
        noticed: ['A priced service'],
        gaps: [],
      },
      recommendations: [],
      readiness: 82,
    }],
    recommendations: ['Add more proof'],
    overallReadiness: 82,
    success: { score: 82 },
    rankAnalysis: {},
  },
  evidence: {
    execution: { boundary: 'server', engineVersion: 'nexez.agent-lab.v2', deterministicAgents: 1, llm: { requested: false, executed: false, model: null, reason: 'not_requested' } },
    competitiveField: { rankingPolicy: 'test', visiblePagesEvaluated: 1, totalPublished: 1, complete: true, cap: 100 },
    commerce: { offersInspected: 1, runtimeDryRuns: 0, scope: 'owner_draft', notice: 'Draft inspected.', offers: [] },
  },
  createdAt: '2026-08-21T23:00:00.000Z',
  persisted: true,
}

describe('per-listing Agent Simulator', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the durable Agent Lab contract and renders the returned analysis', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: simulationRun, persisted: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AgentSimulatorPage params={Promise.resolve({ id: 'page-1' })} />)
    const button = await screen.findByRole('button', { name: 'Run Analysis' })
    fireEvent.change(screen.getByLabelText(/simulate this query/i), { target: { value: 'Find strategy help' } })
    fireEvent.click(button)

    await screen.findByText(/analysis complete and saved/i)
    expect(screen.getByText(/run-marker/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/simulator/runs', expect.objectContaining({ method: 'POST' }))
    const requestOptions = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0][1]
    expect(JSON.parse(String(requestOptions.body))).toEqual({
      pageId: 'page-1',
      query: 'Find strategy help',
      includeLlm: true,
    })
    expect(screen.getByText('Owner draft')).toBeInTheDocument()
    expect(screen.getByText('Saved to history')).toBeInTheDocument()
  })

  it('shows a real error instead of a generic success message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Analysis service unavailable.' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })))

    render(<AgentSimulatorPage params={Promise.resolve({ id: 'page-1' })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Run Analysis' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Analysis service unavailable.')
    await waitFor(() => expect(screen.queryByText(/checkout path responded/i)).not.toBeInTheDocument())
  })
})
