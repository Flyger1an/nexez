import { describe, expect, it } from 'vitest'
import {
  NexezApiError,
  createNexezClient,
  getAgentPage,
  searchNexez,
  submitNegotiation,
  validateCheckout,
  validateNegotiation,
  type FetchLike,
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

describe('Nexez TypeScript SDK', () => {
  it('searches the agent runtime with query, location, and limit', async () => {
    const { calls, fetchImpl } = captureFetch({ schema_version: 'nexez.agent-search.v1', results: [] })

    await searchNexez('strategy session', {
      baseUrl: 'https://agent.example/',
      fetch: fetchImpl,
      location: 'Chicago, IL',
      limit: 3,
    })

    expect(calls[0].url).toBe('https://agent.example/api/agent-search?q=strategy+session&limit=3&location=Chicago%2C+IL')
    expect(calls[0].init?.method).toBe('GET')
  })

  it('fetches an agent page manifest by slug', async () => {
    const { calls, fetchImpl } = captureFetch({ schema_version: 'nexez.agent-page.v1', page: { slug: 'acme' }, offers: [] })

    const manifest = await getAgentPage('acme', { baseUrl: 'https://nexez.test', fetch: fetchImpl })

    expect(manifest.page.slug).toBe('acme')
    expect(calls[0].url).toBe('https://nexez.test/acme/agent.json')
  })

  it('rejects unsafe manifest slugs before fetching', async () => {
    const { calls, fetchImpl } = captureFetch({})

    await expect(getAgentPage('../secret', { fetch: fetchImpl })).rejects.toThrow('Invalid Nexez slug')
    expect(calls).toHaveLength(0)
  })

  it('dry-runs checkout validation and injects the configured buyerAgent', async () => {
    const { calls, fetchImpl } = captureFetch({ ok: true, checkoutUrl: 'https://nexez.test/checkout/acme' })
    const client = createNexezClient({ baseUrl: 'https://nexez.test', fetch: fetchImpl, buyerAgent: 'buyer-bot' })

    await client.validateCheckout({ slug: 'acme', offer: 'services-0', query: 'book this' })

    expect(calls[0].url).toBe('https://nexez.test/api/checkout')
    expect(calls[0].init?.method).toBe('POST')
    expect(calls[0].body).toMatchObject({
      slug: 'acme',
      offer: 'services-0',
      query: 'book this',
      buyerAgent: 'buyer-bot',
      dryRun: true,
    })
  })

  it('dry-runs negotiation validation', async () => {
    const { calls, fetchImpl } = captureFetch({ ok: true, dryRun: true })

    await validateNegotiation(
      { slug: 'acme', offer: 'services-0', budget: '$800' },
      { baseUrl: 'https://nexez.test', fetch: fetchImpl },
    )

    expect(calls[0].url).toBe('https://nexez.test/api/negotiations')
    expect(calls[0].body).toMatchObject({ slug: 'acme', offer: 'services-0', budget: '$800', dryRun: true })
  })

  it('submits negotiation without forcing dryRun', async () => {
    const { calls, fetchImpl } = captureFetch({ ok: true, negotiationId: 'neg_123' })

    await submitNegotiation(
      { slug: 'acme', offer: 'services-0', budget: '$900' },
      { baseUrl: 'https://nexez.test', fetch: fetchImpl },
    )

    expect(calls[0].body).toMatchObject({ slug: 'acme', offer: 'services-0', budget: '$900' })
    expect(calls[0].body).not.toHaveProperty('dryRun')
  })

  it('throws NexezApiError with status and response body on API failure', async () => {
    const { fetchImpl } = captureFetch({ error: 'Nope' }, 404)

    await expect(validateCheckout({ slug: 'missing', offer: 'services-0' }, { fetch: fetchImpl }))
      .rejects
      .toMatchObject({ name: 'NexezApiError', status: 404, body: { error: 'Nope' } } satisfies Partial<NexezApiError>)
  })
})
