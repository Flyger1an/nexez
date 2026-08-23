// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import GlobalAgentSimulator from './SimulatorClient'

const { planRef } = vi.hoisted(() => ({
  planRef: { value: 'free' as 'free' | 'launch' },
}))

vi.mock('../../components/billing/PlanProvider', () => ({
  usePlan: () => planRef.value,
}))

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => {
    const query: any = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      returns: async () => ({ data: [], error: null }),
      single: async () => ({ data: null, error: null }),
    }
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } } }) },
      from: () => query,
    }
  },
}))

const comparison = {
  url: 'https://existing.example',
  host: 'existing.example',
  agentReady: {
    name: 'Existing',
    description: null,
    audience: null,
    location: null,
    offers: [],
    offerCount: 0,
    pricedCount: 0,
    faqCount: 0,
    readiness: 25,
    pagesAnalyzed: 1,
    confidence: 0.5,
  },
  raw: {
    title: 'Existing',
    nativeStructuredData: false,
    nativeAgentDocs: false,
    actionable: false as const,
    summary: 'Unstructured public site.',
  },
  gains: ['Structured offers'],
  verdict: 'A deterministic comparison.',
}

const savedRun = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  kind: 'url_snapshot',
  targetUrl: comparison.url,
  targetHost: comparison.host,
  comparedPageId: null,
  comparedPageSlug: null,
  result: comparison,
  evidence: {},
  createdAt: '2026-08-21T00:00:00.000Z',
}

describe('Agent Lab URL research plan gate', () => {
  let postedBody: Record<string, unknown> | null

  beforeEach(() => {
    planRef.value = 'free'
    postedBody = null
    window.history.replaceState({}, '', '/simulator?mode=url')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/agent-lab/research-runs')) {
        return new Response(JSON.stringify({ runs: [savedRun] }), { status: 200 })
      }
      if (url.includes('/api/simulate-url')) {
        postedBody = JSON.parse(String(init?.body || '{}'))
        return new Response(JSON.stringify({ ok: true, ...comparison }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }))
  })

  it('disables new private saves below Launch while retaining saved replay and removal controls', async () => {
    render(<GlobalAgentSimulator />)

    const save = await screen.findByRole('checkbox', { name: /Save this scan privately/ })
    expect(save).toBeDisabled()
    expect(screen.getByText(/New private reports require Launch or above/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Launch/ })).toBeInTheDocument()

    expect(await screen.findByText('existing.example')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open scan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove saved scan for existing.example' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Public website URL'), { target: { value: 'https://new.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))
    await waitFor(() => expect(postedBody).toMatchObject({ url: 'https://new.example', save: false }))
  })

  it('allows a Launch owner to opt into a new private report', async () => {
    planRef.value = 'launch'
    render(<GlobalAgentSimulator />)

    const save = await screen.findByRole('checkbox', { name: /Save this scan privately/ })
    expect(save).toBeEnabled()
    expect(save).not.toBeChecked()
    fireEvent.click(save)
    fireEvent.change(screen.getByLabelText('Public website URL'), { target: { value: 'https://new.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))

    await waitFor(() => expect(postedBody).toMatchObject({ url: 'https://new.example', save: true }))
  })
})
