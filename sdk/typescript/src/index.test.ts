import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  NexezApiError,
  NexezApprovalError,
  NexezTimeoutError,
  createNexezClient,
  getAgentPage,
  getNegotiationStatus,
  searchNexez,
  startCheckout,
  submitNegotiation,
  validateCheckout,
  validateNegotiation,
  waitForNegotiationDecision,
  type AgentAvailabilityWindow,
  type AgentPageOffer,
  type FetchLike,
  type NegotiationRulesEvaluation,
  type NegotiationStatusResponse,
} from './index'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  })
}

function captureFetch(responseBody: unknown, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit; body?: unknown }> = []
  const fetchImpl: FetchLike = async (input, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ url: String(input), init, body })
    return jsonResponse(responseBody, { status })
  }
  return { calls, fetchImpl }
}

function statusResponse(overrides: Partial<NegotiationStatusResponse> = {}): NegotiationStatusResponse {
  return {
    id: 'neg_123',
    status: 'negotiation',
    statusLabel: 'New proposal',
    offer: 'Strategy session',
    amountCents: null,
    settlementState: null,
    payable: false,
    decisionPending: true,
    decisionSeq: 0,
    decision: null,
    updatedAt: '2026-07-15T00:00:00.000Z',
    next: 'Poll again.',
    ...overrides,
  }
}

describe('Nexez TypeScript SDK', () => {
  it('searches through a preserved gateway path and sends location context', async () => {
    const { calls, fetchImpl } = captureFetch({
      schema_version: 'nexez.agent-search.v1',
      location_filter: { active: true, query: 'Chicago, IL', lat: 41.88, lng: -87.63, matching: 'text' },
      results: [],
    })

    await searchNexez('strategy session', {
      baseUrl: 'https://agent.example/nexez/v1/',
      fetch: fetchImpl,
      location: 'Chicago, IL',
      lat: 41.88,
      lng: -87.63,
      limit: 3,
    })

    expect(calls[0].url).toBe(
      'https://agent.example/nexez/v1/api/agent-search?q=strategy+session&limit=3&location=Chicago%2C+IL&lat=41.88&lng=-87.63',
    )
    expect(calls[0].init?.method).toBe('GET')
  })

  it('accepts only HTTP(S) base URLs without queries or fragments', () => {
    const fetchImpl: FetchLike = async () => jsonResponse({})

    expect(createNexezClient({ baseUrl: 'http://localhost:3000/runtime', fetch: fetchImpl }).baseUrl)
      .toBe('http://localhost:3000/runtime')
    expect(() => createNexezClient({ baseUrl: 'ftp://example.com', fetch: fetchImpl })).toThrow('http or https')
    expect(() => createNexezClient({ baseUrl: 'not a URL', fetch: fetchImpl })).toThrow('Invalid Nexez baseUrl')
    expect(() => createNexezClient({ baseUrl: 'https://user:secret@example.com', fetch: fetchImpl })).toThrow('credentials')
    expect(() => createNexezClient({ baseUrl: 'https://example.com/runtime?q=1', fetch: fetchImpl })).toThrow('query string')
    expect(() => createNexezClient({ baseUrl: 'https://example.com/runtime#fragment', fetch: fetchImpl })).toThrow('fragment')
  })

  it('fetches a typed agent page manifest by a valid slug', async () => {
    const { calls, fetchImpl } = captureFetch({
      schema_version: 'nexez.agent-page.v1',
      page: { slug: 'acme-studio' },
      offers: [],
    })

    const manifest = await getAgentPage('acme-studio', { baseUrl: 'https://nexez.test', fetch: fetchImpl })

    expect(manifest.page.slug).toBe('acme-studio')
    expect(calls[0].url).toBe('https://nexez.test/acme-studio/agent.json')
  })

  it.each(['', '.', '..', '../secret', 'acme/secret', 'acme\\secret', 'Acme', 'acme_store', '-acme', 'acme-', 'acme--store', ' acme']) (
    'rejects invalid manifest slug %j before fetching',
    async (slug) => {
      const { calls, fetchImpl } = captureFetch({})

      await expect(getAgentPage(slug, { fetch: fetchImpl })).rejects.toThrow('Invalid Nexez slug')
      expect(calls).toHaveLength(0)
    },
  )

  it('dry-runs checkout validation and supports a per-call buyer-agent override', async () => {
    const { calls, fetchImpl } = captureFetch({
      ok: true,
      provider: 'provider_ready',
      checkoutUrl: 'https://nexez.test/checkout/acme',
      actionUrl: 'https://seller.example/book',
      currency: 'usd',
      stripeConfigured: false,
      connectReady: false,
      events: {},
    })
    const client = createNexezClient({ baseUrl: 'https://nexez.test', fetch: fetchImpl, buyerAgent: 'default-bot' })

    await client.validateCheckout({
      slug: 'acme',
      offer: 'services-0',
      query: 'book this',
      buyerAgent: 'request-bot',
    })

    expect(calls[0].body).toMatchObject({
      slug: 'acme',
      offer: 'services-0',
      query: 'book this',
      buyerAgent: 'request-bot',
      dryRun: true,
    })
  })

  it('requires approval to start checkout and always disables dry-run', async () => {
    const { calls, fetchImpl } = captureFetch({ url: 'https://seller.example/book', provider: 'provider_redirect' })

    await expect(
      startCheckout(
        { slug: 'acme', offer: 'services-0' } as never,
        { baseUrl: 'https://nexez.test', fetch: fetchImpl },
      ),
    ).rejects.toBeInstanceOf(NexezApprovalError)
    expect(calls).toHaveLength(0)

    await startCheckout(
      { slug: 'acme', offer: 'services-0', userApproved: true, dryRun: true } as never,
      { baseUrl: 'https://nexez.test', fetch: fetchImpl },
    )

    expect(calls[0].body).toMatchObject({ slug: 'acme', offer: 'services-0', dryRun: false })
    expect(calls[0].body).not.toHaveProperty('userApproved')
  })

  it('normalizes a non-negotiable dry run into an actionable rejection', async () => {
    const { calls, fetchImpl } = captureFetch({
      ok: true,
      dryRun: true,
      rulesEvaluation: { decision: 'review', reasons: ['offer_not_negotiable'] },
      publicPageUrl: 'https://nexez.test/acme',
    })

    const result = await validateNegotiation(
      { slug: 'acme', offer: 'services-0', budget: '$800' },
      { baseUrl: 'https://nexez.test', fetch: fetchImpl },
    )

    expect(calls[0].body).toMatchObject({ slug: 'acme', offer: 'services-0', budget: '$800', dryRun: true })
    expect(result).toMatchObject({
      ok: false,
      reason: 'This offer does not accept negotiation. Use checkout at the listed price.',
    })
  })

  it('does not assume malformed negotiation reasons are an array', async () => {
    const { fetchImpl } = captureFetch({
      ok: true,
      dryRun: true,
      rulesEvaluation: { decision: 'review', reasons: 'unexpected' },
      publicPageUrl: 'https://nexez.test/acme',
    })

    const result = await validateNegotiation(
      { slug: 'acme', offer: 'services-0' },
      { baseUrl: 'https://nexez.test', fetch: fetchImpl },
    )

    expect(result.ok).toBe(true)
  })

  it('requires approval and submits negotiation with dry-run disabled', async () => {
    const { calls, fetchImpl } = captureFetch({
      ok: true,
      status: 'negotiation',
      decisionPending: true,
      negotiationId: 'neg_123',
      persistentLink: 'https://nexez.test/negotiate/neg_123',
      negotiationUrl: 'https://nexez.test/negotiate/neg_123',
      escrowMode: 'not_configured',
      stripeConfigured: false,
      publicPageUrl: 'https://nexez.test/acme',
      next: 'Poll.',
      message: 'Proposal received.',
    })

    await expect(
      submitNegotiation(
        { slug: 'acme', offer: 'services-0', budget: '$900' } as never,
        { baseUrl: 'https://nexez.test', fetch: fetchImpl },
      ),
    ).rejects.toBeInstanceOf(NexezApprovalError)

    await submitNegotiation(
      { slug: 'acme', offer: 'services-0', budget: '$900', userApproved: true, dryRun: true } as never,
      { baseUrl: 'https://nexez.test', fetch: fetchImpl },
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({ slug: 'acme', offer: 'services-0', budget: '$900', dryRun: false })
    expect(calls[0].body).not.toHaveProperty('userApproved')
  })

  it('encodes opaque negotiation credentials and redacts tokens from errors', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ error: 'Not found' }, { status: 404 })
    }

    const promise = getNegotiationStatus(
      { negotiationId: 'neg_123', statusToken: 'secret/token+?' },
      { baseUrl: 'https://nexez.test/gateway', fetch: fetchImpl },
    )

    await expect(promise).rejects.toMatchObject({
      name: 'NexezApiError',
      status: 404,
    })
    expect(new URL(calls[0].url).pathname).toBe('/gateway/api/negotiations/status')
    expect(new URL(calls[0].url).searchParams.get('token')).toBe('secret/token+?')

    try {
      await promise
    } catch (error) {
      expect((error as NexezApiError).url).not.toContain('secret')
      expect(new URL((error as NexezApiError).url).searchParams.get('token')).toBe('[redacted]')
    }
  })

  it('polls until an asynchronous negotiation decision is ready', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const statuses = [
      statusResponse(),
      statusResponse({
        decisionPending: false,
        decisionSeq: 1,
        decision: { action: 'counter', reasoning: 'A smaller scope fits.', counter: { priceCents: 90_000 } },
      }),
    ]
    const fetchImpl: FetchLike = async (input) => {
      calls.push(String(input))
      return jsonResponse(statuses.shift())
    }

    const pending = waitForNegotiationDecision(
      { negotiationId: 'neg_123', statusToken: 'token_123', timeoutMs: 5_000, intervalMs: 1_000 },
      { baseUrl: 'https://nexez.test', fetch: fetchImpl },
    )
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await pending
    vi.useRealTimers()

    expect(calls).toHaveLength(2)
    expect(result).toMatchObject({
      decisionPending: false,
      decisionSeq: 1,
      decision: { action: 'counter', counter: { priceCents: 90_000 } },
    })
  })

  it('bounds negotiation polling and validates polling durations', async () => {
    const { calls, fetchImpl } = captureFetch(statusResponse())

    await expect(
      waitForNegotiationDecision(
        { negotiationId: 'neg_123', statusToken: 'token_123', timeoutMs: 5, intervalMs: 1_000 },
        { baseUrl: 'https://nexez.test', fetch: fetchImpl },
      ),
    ).rejects.toMatchObject({ name: 'NexezTimeoutError', timeoutMs: 5 })
    expect(calls.length).toBeGreaterThan(0)

    await expect(
      waitForNegotiationDecision(
        { negotiationId: 'neg_123', statusToken: 'token_123', timeoutMs: 300_001 },
        { fetch: fetchImpl },
      ),
    ).rejects.toBeInstanceOf(RangeError)
    await expect(
      waitForNegotiationDecision(
        { negotiationId: 'neg_123', statusToken: 'token_123', intervalMs: 999 },
        { fetch: fetchImpl },
      ),
    ).rejects.toBeInstanceOf(RangeError)
  })

  it('rejects a negotiation status object without a boolean decisionPending field', async () => {
    const { fetchImpl } = captureFetch({ id: 'neg_123', status: 'negotiation' })

    await expect(
      getNegotiationStatus(
        { negotiationId: 'neg_123', statusToken: 'secret-token' },
        { baseUrl: 'https://nexez.test', fetch: fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: 'NexezApiError',
      status: 200,
      message: expect.stringContaining('decisionPending must be boolean'),
    })
  })

  it('propagates AbortSignal cancellation to an in-flight request', async () => {
    const controller = new AbortController()
    const receivedSignals: AbortSignal[] = []
    const fetchImpl: FetchLike = async (_input, init) => {
      if (init?.signal) receivedSignals.push(init.signal)
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    }
    const client = createNexezClient({ fetch: fetchImpl })
    const request = client.search('strategy', { signal: controller.signal })

    controller.abort(new Error('buyer cancelled'))

    await expect(request).rejects.toThrow('buyer cancelled')
    expect(receivedSignals[0]?.aborted).toBe(true)
  })

  it('times out even when a custom fetch implementation ignores its signal', async () => {
    const fetchImpl: FetchLike = async () => new Promise<Response>(() => {})
    const client = createNexezClient({ fetch: fetchImpl })

    await expect(client.search('strategy', { timeoutMs: 10 })).rejects.toMatchObject({
      name: 'NexezTimeoutError',
      timeoutMs: 10,
    } satisfies Partial<NexezTimeoutError>)
  })

  it.each([
    ['HTML', new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['array JSON', jsonResponse([])],
    ['null JSON', jsonResponse(null)],
    ['empty body', new Response(null, { status: 200 })],
  ])('rejects a successful %s response that is not a JSON object', async (_label, response) => {
    const client = createNexezClient({ fetch: async () => response.clone() })

    await expect(client.search('strategy')).rejects.toMatchObject({
      name: 'NexezApiError',
      status: 200,
      message: 'Nexez returned an invalid JSON object response.',
    })
  })

  it('throws NexezApiError with status, safe URL, and parsed body on API failure', async () => {
    const { fetchImpl } = captureFetch({ error: 'Nope' }, 404)

    await expect(validateCheckout({ slug: 'missing', offer: 'services-0' }, { fetch: fetchImpl }))
      .rejects
      .toMatchObject({ name: 'NexezApiError', status: 404, body: { error: 'Nope' } } satisfies Partial<NexezApiError>)
  })

  it('exports materially typed offer, rule, and status fields', () => {
    expectTypeOf<AgentPageOffer['accepts_negotiation']>().toEqualTypeOf<boolean>()
    expectTypeOf<AgentPageOffer['action']['endpoint']>().toEqualTypeOf<string>()
    expectTypeOf<NonNullable<AgentPageOffer['consumer']>['duration']>().toEqualTypeOf<string | null>()
    expectTypeOf<AgentAvailabilityWindow['date']>().toEqualTypeOf<string>()
    expectTypeOf<NegotiationRulesEvaluation['decision']>()
      .toEqualTypeOf<'auto_accept' | 'review' | 'flag'>()
    expectTypeOf<NegotiationStatusResponse['settlementState']>()
      .toEqualTypeOf<'auto' | 'awaiting_approval' | 'approved' | null>()
  })
})
