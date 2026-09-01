import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, turnRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  turnRef: { impl: null as any },
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../../lib/agents/nexxi-auth', () => ({ authenticateNexxiRequest: vi.fn(async () => authRef.result) }))
vi.mock('../../../../../lib/agents/nexxi', () => ({ handleNexxiTurn: vi.fn((input: any) => turnRef.impl(input)) }))

import { POST } from './route'

const req = (body: unknown = { message: 'hi' }) =>
  new Request('https://nexez.test/api/agents/nexxi/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

// Parse an SSE body into the list of decoded `data:` event objects.
async function readEvents(res: Response): Promise<any[]> {
  const text = await res.text()
  return text
    .split('\n\n')
    .map((b) => b.trim())
    .filter((b) => b.startsWith('data:'))
    .map((b) => JSON.parse(b.slice(5).trim()))
}

const model = { configured: true, provider: 'x', name: 'test-model' }
const pageResult = {
  type: 'page_result' as const,
  id: 'p',
  title: 'Consultation',
  subtitle: 'Demo',
  description: null,
  price: '$100',
  slug: 'demo',
  url: 'https://nexez.test/demo',
  agentJsonUrl: 'https://nexez.test/demo/agent.json',
  offerKey: 'services-0',
  offerName: 'Consultation',
  checkoutUrl: 'https://nexez.test/checkout/demo?offer=services-0',
  score: 10,
  commerce: {
    state: 'actionable' as const,
    rail: 'one_time' as const,
    reasonCode: 'supported' as const,
    message: 'Nexxi can prepare this checkout handoff for your approval.',
  },
}

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'u1', email: 'b@x.com' }, db: {} }
  turnRef.impl = async (input: any) => {
    input.onToken?.('Found ')
    input.onToken?.('one.')
    return { threadId: 't1', agentId: 'a1', message: 'Found one.', cards: [pageResult], suggestions: ['s'], toolsUsed: ['search_pages'], memory: {}, model }
  }
})

describe('POST /api/agents/nexxi/stream', () => {
  it('401s when unauthenticated (no stream)', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await POST(req())).status).toBe(401)
  })

  it('400s when no message and no approval', async () => {
    expect((await POST(req({}))).status).toBe(400)
  })

  it('streams token events then an authoritative done event', async () => {
    const res = await POST(req())
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const events = await readEvents(res)
    const tokens = events.filter((e) => e.type === 'token').map((e) => e.value)
    expect(tokens).toEqual(['Found ', 'one.'])
    const done = events.find((e) => e.type === 'done')
    expect(done).toMatchObject({ message: 'Found one.', threadId: 't1', cards: [{ id: 'p' }] })
  })

  it('replays the message in chunks when the turn streams nothing (deterministic/approval)', async () => {
    turnRef.impl = async () => ({ threadId: 't2', agentId: 'a1', message: 'Two words', cards: [], suggestions: [], toolsUsed: [], memory: {}, model })
    const events = await readEvents(await POST(req()))
    const streamed = events.filter((e) => e.type === 'token').map((e) => e.value).join('')
    expect(streamed).toBe('Two words') // chunk-replayed
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('emits an error event when the turn throws', async () => {
    turnRef.impl = async () => {
      throw new Error('boom')
    }
    const events = await readEvents(await POST(req()))
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: 'boom' })
  })
})
