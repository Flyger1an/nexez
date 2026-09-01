// @vitest-environment jsdom
// Nexxi regression after the agent-chat factor-out (spec §6/§11.3): the shipped
// buyer surface must behave byte-for-byte - same endpoint contract, same thread
// reuse, same approval flow, same copy.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { NexxiChat } from './nexxi-chat'

// Build an SSE body that replays a turn result as a single authoritative `done`
// frame (the shape the stream route emits; token frames are optional preview).
function sseBody(frames: object[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(enc.encode(`data: ${JSON.stringify(frame)}\n\n`))
      controller.close()
    },
  })
}

type MockResponse = {
  ok?: boolean
  body: Record<string, unknown>
  tokens?: string[]
  streamBody?: ReadableStream<Uint8Array> | null
}

// Normal turns stream over /api/agents/nexxi/stream (SSE); approvals still POST
// JSON to /api/agents/nexxi. Responses are consumed in order across both routes.
function mockFetch(responses: MockResponse[]) {
  const calls: Array<{ url: string; payload: Record<string, unknown> }> = []
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, payload: JSON.parse(String(init.body)) })
      const next = responses[Math.min(call++, responses.length - 1)]
      const ok = next.ok !== false
      if (u.endsWith('/stream')) {
        if ('streamBody' in next) return { ok, body: next.streamBody, json: async () => next.body } as unknown as Response
        if (!ok) return { ok, body: null, json: async () => next.body } as unknown as Response
        const tokenFrames = (next.tokens ?? []).map((value) => ({ type: 'token', value }))
        return { ok, body: sseBody([...tokenFrames, { type: 'done', ...next.body }]) } as unknown as Response
      }
      return { ok, json: async () => next.body } as Response
    }),
  )
  return calls
}

async function sendText(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Ask Nexxi to find, compare, negotiate, or book...'), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('NexxiChat (regression after the agent-chat factor-out)', () => {
  it('renders the shipped identity: Nexxi header, buyer-agent badge, welcome, starters, footnote', () => {
    render(<NexxiChat />)
    expect(screen.getByRole('heading', { name: 'Nexxi' })).toBeInTheDocument()
    expect(screen.getByText('buyer agent')).toBeInTheDocument()
    expect(screen.getByText(/I am Nexxi, your buyer agent/)).toBeInTheDocument()
    expect(screen.getByText('Find a local brand photographer under $500')).toBeInTheDocument()
    expect(screen.getByText(/Nexxi asks before submitting offers/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument()
  })

  it('streams a turn over /api/agents/nexxi/stream with {message, threadId, mode}, rendering tokens then the final reply', async () => {
    const calls = mockFetch([
      { tokens: ['Found ', 'two '], body: { threadId: 't-1', message: 'Found two options.', cards: [] } },
    ])
    render(<NexxiChat />)
    await sendText('find a photographer')
    await waitFor(() => expect(screen.getByText('Found two options.')).toBeInTheDocument())
    expect(calls[0].url).toBe('/api/agents/nexxi/stream')
    expect(calls[0].payload).toEqual({ message: 'find a photographer', mode: 'text', threadId: undefined })
  })

  it('reuses the server-issued threadId on subsequent turns', async () => {
    const calls = mockFetch([
      { body: { threadId: 't-1', message: 'First reply.', cards: [] } },
      { body: { threadId: 't-1', message: 'Second reply.', cards: [] } },
    ])
    render(<NexxiChat />)
    await sendText('first')
    await waitFor(() => expect(screen.getByText('First reply.')).toBeInTheDocument())
    await sendText('second')
    await waitFor(() => expect(screen.getByText('Second reply.')).toBeInTheDocument())
    expect(calls[1].payload.threadId).toBe('t-1')
  })

  it('falls back to the JSON route when streaming is unavailable', async () => {
    const calls = mockFetch([
      { streamBody: null, body: {} },
      { body: { threadId: 't-json', message: 'Fallback reply.', cards: [] } },
    ])
    render(<NexxiChat />)
    await sendText('find a strategist')
    await waitFor(() => expect(screen.getByText('Fallback reply.')).toBeInTheDocument())
    expect(calls.map((call) => call.url)).toEqual(['/api/agents/nexxi/stream', '/api/agents/nexxi'])
    expect(calls[1].payload).toEqual({ message: 'find a strategist', mode: 'text', threadId: undefined })
  })

  it('renders page_result cards with the View listing link', async () => {
    mockFetch([
      {
        body: {
          threadId: 't-1',
          message: 'Here is a match.',
          cards: [
            {
              type: 'page_result',
              id: 'p1',
              title: 'Apex Photography',
              subtitle: 'Photography',
              description: 'Brand shoots.',
              price: '$450',
              slug: 'apex-photo',
              url: 'https://nexez.app/apex-photo',
              agentJsonUrl: 'https://nexez.app/apex-photo/agent.json',
              offerKey: 'services-0',
              offerName: 'Brand shoot',
              checkoutUrl: '/checkout/apex-photo',
              score: 0.9,
            },
          ],
        },
      },
    ])
    render(<NexxiChat />)
    await sendText('find a photographer')
    await waitFor(() => expect(screen.getByText('Apex Photography')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', 'https://nexez.app/apex-photo')
    expect(screen.getByText('$450')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask Nexxi to book' })).toBeInTheDocument()
    // starters hide once cards are on the table
    expect(screen.queryByText('Find a local brand photographer under $500')).not.toBeInTheDocument()
  })

  it('approval card: Approve posts {threadId, approval:{id, decision}} and renders the outcome', async () => {
    const calls = mockFetch([
      {
        body: {
          threadId: 't-1',
          message: 'I need your approval to proceed.',
          cards: [
            {
              type: 'approval',
              id: 'appr-1',
              status: 'PENDING',
              toolName: 'trigger_booking',
              title: 'Book Brand shoot',
              summary: 'Book Brand shoot for $450 on /apex-photo.',
              payload: {},
            },
          ],
        },
      },
      { body: { threadId: 't-1', message: 'Booked! Confirmation sent.', cards: [] } },
    ])
    render(<NexxiChat />)
    await sendText('book it')
    await waitFor(() => expect(screen.getByText('Book Brand shoot')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
    await waitFor(() => expect(screen.getByText('Booked! Confirmation sent.')).toBeInTheDocument())
    expect(calls[1].payload).toEqual({ approval: { id: 'appr-1', decision: 'approved' }, threadId: 't-1' })
  })

  it('surfaces the API error message when a turn fails', async () => {
    const calls = mockFetch([{ ok: false, body: { error: 'Sign in to use Nexxi.' } }])
    render(<NexxiChat />)
    await sendText('hello')
    await waitFor(() => expect(screen.getByText('Sign in to use Nexxi.')).toBeInTheDocument())
    expect(calls).toHaveLength(1)
  })
})
