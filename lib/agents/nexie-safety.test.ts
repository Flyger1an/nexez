import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeBooking, executeNegotiation } from './nexie'

// Prompt-injection / jailbreak resistance for the money path: the agent's tool payload
// originates with the LLM, so a jailbroken or injected prompt could try to transact AS
// someone else. The hard guarantee is that buyer identity is injected from the
// authenticated SESSION at execution time and the LLM payload's identity fields are ignored.

function captureFetch(): { body: () => Record<string, unknown> } {
  const store: { body?: Record<string, unknown> } = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, opts: RequestInit) => {
      store.body = JSON.parse(opts.body as string)
      return new Response(JSON.stringify({ ok: true, message: 'done', url: 'https://nexez.app/x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  return { body: () => store.body ?? {} }
}

describe('Nexxi money-path safety - buyer identity comes from the session, never the LLM payload', () => {
  beforeEach(() => {
    process.env.NEXIE_AGENT_RUNTIME_URL = 'https://nexez.app'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXIE_AGENT_RUNTIME_URL
  })

  it('executeBooking ignores payload-supplied buyer identity + agent label', async () => {
    const cap = captureFetch()
    await executeBooking(
      { slug: 'spa', offer: 'services-0', buyerEmail: 'victim@evil.com', buyerReference: 'victim-id', buyerAgent: 'NotNexxi' },
      { email: 'real@buyer.com', userId: 'real-uid' },
    )
    const body = cap.body()
    expect(body.buyerEmail).toBe('real@buyer.com')
    expect(body.buyerReference).toBe('real-uid')
    expect(body.buyerAgent).toBe('Nexxi')
    expect(JSON.stringify(body)).not.toContain('victim')
    expect(JSON.stringify(body)).not.toContain('NotNexxi')
  })

  it('executeNegotiation uses the session contact, not a payload-injected contact', async () => {
    const cap = captureFetch()
    await executeNegotiation(
      { slug: 'spa', offer: 'services-0', query: 'deal', contact: 'victim@evil.com', buyerAgent: 'NotNexxi' },
      { email: 'real@buyer.com', userId: 'real-uid' },
    )
    const body = cap.body()
    expect(body.contact).toBe('real@buyer.com')
    expect(body.buyerAgent).toBe('Nexxi')
    expect(JSON.stringify(body)).not.toContain('victim')
  })

  it('executeNegotiation only falls back to the payload contact when there is no session email', async () => {
    const cap = captureFetch()
    await executeNegotiation({ slug: 'spa', offer: 'x', query: 'q', contact: 'provided@buyer.com' }, { email: null, userId: 'uid' })
    // Documents the no-session-email path (the route requires auth, so this is an edge).
    expect(cap.body().contact).toBe('provided@buyer.com')
  })

  it('surfaces a failed action (so the caller marks it FAILED, nothing silently "succeeds")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'rejected' }), { status: 400, headers: { 'content-type': 'application/json' } })),
    )
    await expect(executeBooking({ slug: 's', offer: 'o' }, { email: 'a@b.com', userId: 'u' })).rejects.toThrow()
  })
})
