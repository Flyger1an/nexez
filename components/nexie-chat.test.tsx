// @vitest-environment jsdom
// Nexie regression after the agent-chat factor-out (spec §6/§11.3): the shipped
// buyer surface must behave byte-for-byte — same endpoint contract, same thread
// reuse, same approval flow, same copy.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { NexieChat } from './nexie-chat'

function mockFetch(responses: Array<{ ok?: boolean; body: Record<string, unknown> }>) {
  const calls: Array<{ url: string; payload: Record<string, unknown> }> = []
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), payload: JSON.parse(String(init.body)) })
      const next = responses[Math.min(call++, responses.length - 1)]
      return { ok: next.ok !== false, json: async () => next.body } as Response
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

describe('NexieChat (regression after the agent-chat factor-out)', () => {
  it('renders the shipped identity: Nexxi header, buyer-agent badge, welcome, starters, footnote', () => {
    render(<NexieChat />)
    expect(screen.getByRole('heading', { name: 'Nexxi' })).toBeInTheDocument()
    expect(screen.getByText('buyer agent')).toBeInTheDocument()
    expect(screen.getByText(/I am Nexxi, your buyer agent/)).toBeInTheDocument()
    expect(screen.getByText('Find a local brand photographer under $500')).toBeInTheDocument()
    expect(screen.getByText(/Nexxi asks before submitting offers/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument()
  })

  it('posts a turn to /api/agents/nexie with {message, threadId, mode} and renders the reply', async () => {
    const calls = mockFetch([{ body: { threadId: 't-1', message: 'Found two options.', cards: [] } }])
    render(<NexieChat />)
    await sendText('find a photographer')
    await waitFor(() => expect(screen.getByText('Found two options.')).toBeInTheDocument())
    expect(calls[0].url).toBe('/api/agents/nexie')
    expect(calls[0].payload).toEqual({ message: 'find a photographer', mode: 'text', threadId: undefined })
  })

  it('reuses the server-issued threadId on subsequent turns', async () => {
    const calls = mockFetch([
      { body: { threadId: 't-1', message: 'First reply.', cards: [] } },
      { body: { threadId: 't-1', message: 'Second reply.', cards: [] } },
    ])
    render(<NexieChat />)
    await sendText('first')
    await waitFor(() => expect(screen.getByText('First reply.')).toBeInTheDocument())
    await sendText('second')
    await waitFor(() => expect(screen.getByText('Second reply.')).toBeInTheDocument())
    expect(calls[1].payload.threadId).toBe('t-1')
  })

  it('renders page_result cards with the View page link', async () => {
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
    render(<NexieChat />)
    await sendText('find a photographer')
    await waitFor(() => expect(screen.getByText('Apex Photography')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'View page' })).toHaveAttribute('href', 'https://nexez.app/apex-photo')
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
    render(<NexieChat />)
    await sendText('book it')
    await waitFor(() => expect(screen.getByText('Book Brand shoot')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
    await waitFor(() => expect(screen.getByText('Booked! Confirmation sent.')).toBeInTheDocument())
    expect(calls[1].payload).toEqual({ approval: { id: 'appr-1', decision: 'approved' }, threadId: 't-1' })
  })

  it('surfaces the API error message when a turn fails', async () => {
    mockFetch([{ ok: false, body: { error: 'Sign in to use Nexxi.' } }])
    render(<NexieChat />)
    await sendText('hello')
    await waitFor(() => expect(screen.getByText('Sign in to use Nexxi.')).toBeInTheDocument())
  })
})
