// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { applyIntakeAction, createIntakeState, type IntakeState } from '../../lib/intake'
import { IntakeChat } from './IntakeChat'

// ---------------------------------------------------------------------------
// Fixtures — session states built through the real machine (no drift).

function scratchState(): IntakeState {
  let state = createIntakeState()
  for (const action of [
    { type: 'ADD_SOURCE' as const, source: { id: 's1', kind: 'none' as const, value: '', addedAt: '2026-07-06T00:00:00Z' } },
    { type: 'ANALYZE_GAPS' as const },
  ]) {
    const applied = applyIntakeAction(state, action)
    if (applied.ok) state = applied.state
  }
  return state
}

function urlState(): IntakeState {
  let state = createIntakeState()
  for (const action of [
    { type: 'ADD_SOURCE' as const, source: { id: 's1', kind: 'url' as const, value: 'https://apex.example', label: 'https://apex.example', addedAt: '2026-07-06T00:00:00Z' } },
    {
      type: 'RECORD_EXTRACTION' as const,
      extraction: {
        sourceId: 's1',
        title: 'Apex Catering Co.',
        description: 'Full-service catering.',
        offers: [
          { name: 'Event Catering', description: 'Full service', price: '$1,200', url: '', duration: '4 hours' },
          { name: 'Drop-off Trays', description: 'Delivered trays', price: '', url: '' },
        ],
        confidence: 0.82,
      },
    },
    { type: 'ANALYZE_GAPS' as const },
  ]) {
    const applied = applyIntakeAction(state, action)
    if (applied.ok) state = applied.state
  }
  return state
}

type Route = { match: (url: string, init?: RequestInit) => boolean; status?: number; body: unknown }

function mockFetch(routes: Route[]) {
  const calls: Array<{ url: string; method: string; payload?: any }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const entry = { url: String(url), method: init?.method ?? 'GET', payload: init?.body ? JSON.parse(String(init.body)) : undefined }
      calls.push(entry)
      const route = routes.find((r) => r.match(entry.url, init))
      if (!route) return { ok: false, status: 404, json: async () => ({ error: 'no mock route' }) } as Response
      const status = route.status ?? 200
      return { ok: status < 400, status, json: async () => route.body } as Response
    }),
  )
  return calls
}

const noSessions: Route = { match: (url, init) => url.endsWith('/api/agents/intake/threads') && (!init || !init.method || init.method === 'GET'), body: { ok: true, sessions: [] } }

afterEach(() => vi.unstubAllGlobals())

// ---------------------------------------------------------------------------

describe('IntakeChat — setup', () => {
  it('renders the setup screen with both start paths and the form escape hatch', async () => {
    mockFetch([noSessions])
    const onSwitch = vi.fn()
    render(<IntakeChat onSwitchToForm={onSwitch} />)
    expect(screen.getByText('Talk it through')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://yourbusiness.com')).toBeInTheDocument()
    expect(screen.getByText('Start with my site')).toBeInTheDocument()
    expect(screen.getByText('Start from scratch')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Skip the chat — build with the form'))
    expect(onSwitch).toHaveBeenCalled()
  })

  it('shows the sign-in path when the API returns 401', async () => {
    mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 401, body: { error: 'Sign in.', code: 'auth_required' } },
    ])
    render(<IntakeChat />)
    fireEvent.click(screen.getByText('Start from scratch'))
    await waitFor(() => expect(screen.getByText(/Sign in to start your interview/)).toBeInTheDocument())
    expect(screen.getByText('Start your free trial')).toHaveAttribute('href', '/onboard?next=/create')
  })

  it('surfaces a start failure inline and stays on setup', async () => {
    mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 500, body: { error: 'Could not start the interview.' } },
    ])
    render(<IntakeChat />)
    fireEvent.click(screen.getByText('Start from scratch'))
    await waitFor(() => expect(screen.getByText('Could not start the interview.')).toBeInTheDocument())
    expect(screen.getByText('Start from scratch')).toBeInTheDocument()
  })
})

describe('IntakeChat — re-interview mode (existing listing)', () => {
  /** A session seeded from an existing page, built through the real machine. */
  function seededState(): IntakeState {
    let state = createIntakeState({
      seed: {
        name: 'Existing Biz',
        description: 'A shop that already exists.',
        services: [{ name: 'Old Offer', description: '', price: '$50', url: '' }],
      },
    })
    for (const action of [
      { type: 'ADD_SOURCE' as const, source: { id: 's1', kind: 'integration' as const, value: 'page:page-7', label: 'Existing listing', addedAt: '2026-07-07T00:00:00Z' } },
      { type: 'ANALYZE_GAPS' as const },
    ]) {
      const applied = applyIntakeAction(state, action)
      if (applied.ok) state = applied.state
    }
    return state
  }

  it('renders the re-interview setup — single start action, no URL/scratch inputs', async () => {
    mockFetch([noSessions])
    render(<IntakeChat reinterviewPageId="page-7" />)
    expect(screen.getByText('Re-interview this listing')).toBeInTheDocument()
    expect(screen.getByText('Start the re-interview')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('https://yourbusiness.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Start from scratch')).not.toBeInTheDocument()
  })

  it('start posts page_id and the opening message names the listing', async () => {
    const calls = mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 201, body: { ok: true, id: 'sess-r', state: seededState() } },
    ])
    render(<IntakeChat reinterviewPageId="page-7" />)
    fireEvent.click(screen.getByText('Start the re-interview'))
    await waitFor(() => expect(screen.getByText(/I re-read Existing Biz/)).toBeInTheDocument())
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/agents/intake/threads'))
    expect(create?.payload).toEqual({ page_id: 'page-7' })
  })

  it('only offers to resume a session for THIS listing', async () => {
    mockFetch([
      {
        match: (url, init) => url.endsWith('/api/agents/intake/threads') && (!init?.method || init.method === 'GET'),
        body: { ok: true, sessions: [{ id: 'sess-other', status: 'active', phase: 'INTERVIEW', pageId: 'different-page', updatedAt: null }] },
      },
    ])
    render(<IntakeChat reinterviewPageId="page-7" />)
    await waitFor(() => expect(screen.getByText('Start the re-interview')).toBeInTheDocument())
    expect(screen.queryByText('Resume your interview in progress')).not.toBeInTheDocument()
  })

  it('resumes the matching listing session when one exists', async () => {
    mockFetch([
      {
        match: (url, init) => url.endsWith('/api/agents/intake/threads') && (!init?.method || init.method === 'GET'),
        body: { ok: true, sessions: [{ id: 'sess-mine', status: 'active', phase: 'INTERVIEW', pageId: 'page-7', updatedAt: null }] },
      },
      { match: (url) => url.endsWith('/threads/sess-mine'), body: { ok: true, id: 'sess-mine', status: 'active', phase: 'INTERVIEW', state: seededState() } },
    ])
    render(<IntakeChat reinterviewPageId="page-7" />)
    await waitFor(() => expect(screen.getByText('Resume your interview in progress')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Resume your interview in progress'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nexez intake' })).toBeInTheDocument())
  })
})

describe('IntakeChat — interview', () => {
  it('a scratch start opens the chat with the first gap batch (blocking marks + quick answers)', async () => {
    mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 201, body: { ok: true, id: 'sess-1', state: scratchState() } },
    ])
    render(<IntakeChat />)
    fireEvent.click(screen.getByText('Start from scratch'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nexez intake' })).toBeInTheDocument())
    expect(screen.getByText('seller agent')).toBeInTheDocument()
    // the machine's first blocking question is on screen with a Skip chip
    expect(screen.getByText('What is the name of your business?')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Skip' }).length).toBeGreaterThan(0)
  })

  it('a URL start shows the source_ingested card with offer count + confidence', async () => {
    mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 201, body: { ok: true, id: 'sess-1', state: urlState() } },
    ])
    render(<IntakeChat />)
    fireEvent.change(screen.getByPlaceholderText('https://yourbusiness.com'), { target: { value: 'https://apex.example' } })
    fireEvent.click(screen.getByText('Start with my site'))
    await waitFor(() => expect(screen.getByText('Read https://apex.example')).toBeInTheDocument())
    expect(screen.getByText('2 offers imported · 82% confidence')).toBeInTheDocument()
  })

  it('a Skip chip posts structured answers to /messages and appends the agent response', async () => {
    const calls = mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 201, body: { ok: true, id: 'sess-1', state: scratchState() } },
      { match: (url) => url.includes('/threads/sess-1/messages'), body: { ok: true, message: 'Noted — next question.', cards: [] } },
    ])
    render(<IntakeChat />)
    fireEvent.click(screen.getByText('Start from scratch'))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Skip' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip' })[0])
    await waitFor(() => expect(screen.getByText('Noted — next question.')).toBeInTheDocument())
    const turn = calls.find((c) => c.url.includes('/messages'))
    expect(turn?.payload.answers).toEqual([{ gapId: 'page:name', answer: 'skip', skipped: true }])
  })

  it('typed turns post content to /messages', async () => {
    const calls = mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 201, body: { ok: true, id: 'sess-1', state: scratchState() } },
      { match: (url) => url.includes('/threads/sess-1/messages'), body: { ok: true, message: 'Great name!', cards: [] } },
    ])
    render(<IntakeChat />)
    fireEvent.click(screen.getByText('Start from scratch'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nexez intake' })).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Answer, ask, or say "skip"...'), { target: { value: 'We are Apex Catering' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByText('Great name!')).toBeInTheDocument())
    expect(calls.find((c) => c.url.includes('/messages'))?.payload).toEqual({ content: 'We are Apex Catering' })
  })

  it('the handoff card commits and navigates to the builder', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', { writable: true, value: { ...originalLocation, href: '' } })
    const calls = mockFetch([
      noSessions,
      { match: (url, init) => url.endsWith('/api/agents/intake/threads') && init?.method === 'POST', status: 201, body: { ok: true, id: 'sess-1', state: scratchState() } },
      {
        match: (url) => url.includes('/threads/sess-1/messages'),
        body: { ok: true, message: 'All set!', cards: [{ type: 'handoff', via: 'agent' }] },
      },
      { match: (url) => url.includes('/threads/sess-1/commit'), body: { ok: true, pageId: 'page-9', builderPath: '/dashboard/page-9' } },
    ])
    render(<IntakeChat />)
    fireEvent.click(screen.getByText('Start from scratch'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nexez intake' })).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Answer, ask, or say "skip"...'), { target: { value: 'done' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByText('Your draft is ready')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Open builder/ }))
    await waitFor(() => expect(calls.some((c) => c.url.includes('/commit'))).toBe(true))
    await waitFor(() => expect(String(window.location.href)).toContain('/dashboard/page-9'))
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation })
  })

  it('offers to resume an existing interview and replays its transcript', async () => {
    let resumed = scratchState()
    const withMessage = applyIntakeAction(resumed, {
      type: 'ADD_MESSAGE',
      message: { id: 'm1', role: 'owner', content: 'we are Apex', at: '2026-07-06T00:00:00Z' },
    })
    if (withMessage.ok) resumed = withMessage.state
    mockFetch([
      {
        match: (url, init) => url.endsWith('/api/agents/intake/threads') && (!init?.method || init.method === 'GET'),
        body: { ok: true, sessions: [{ id: 'sess-old', status: 'active', phase: 'INTERVIEW', updatedAt: '2026-07-05T00:00:00Z' }] },
      },
      { match: (url) => url.endsWith('/threads/sess-old'), body: { ok: true, id: 'sess-old', status: 'active', phase: 'INTERVIEW', state: resumed } },
    ])
    render(<IntakeChat />)
    await waitFor(() => expect(screen.getByText('Resume your interview in progress')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Resume your interview in progress'))
    await waitFor(() => expect(screen.getByText('we are Apex')).toBeInTheDocument())
    expect(screen.getByText('Picking up where we left off:')).toBeInTheDocument()
  })
})
