import { describe, expect, it } from 'vitest'
import { createNexezClient, type FetchLike } from './index'
import {
  NEXEZ_AGENT_TOOL_DEFINITIONS,
  createNexezAgentToolExecutors,
  createOpenAiFunctionTools,
  createVercelAiSdkTools,
} from './tools'

function captureFetch() {
  const calls: Array<{ url: string; init?: RequestInit; body?: unknown }> = []
  const fetch: FetchLike = async (input, init) => {
    calls.push({
      url: String(input),
      init,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return new Response(JSON.stringify({ ok: true, results: [] }), {
      headers: { 'content-type': 'application/json' },
    })
  }
  return { calls, fetch }
}

describe('Nexez framework tool adapters', () => {
  it('exports one canonical nine-tool contract with closed object schemas', () => {
    expect(NEXEZ_AGENT_TOOL_DEFINITIONS).toHaveLength(9)
    expect(new Set(NEXEZ_AGENT_TOOL_DEFINITIONS.map((tool) => tool.name)).size).toBe(9)
    expect(createOpenAiFunctionTools()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'nexez_search', strict: false }),
      }),
    ]))
  })

  it('executes filtered discovery through the supplied Nexez client', async () => {
    const { calls, fetch } = captureFetch()
    const executors = createNexezAgentToolExecutors(createNexezClient({ baseUrl: 'https://nexez.test', fetch }))
    await executors.nexez_search({
      query: 'strategy',
      verified: true,
      supportsNegotiation: true,
      priceBand: '500_2000',
    })
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('verified')).toBe('true')
    expect(url.searchParams.get('supports_negotiation')).toBe('true')
    expect(url.searchParams.get('price_band')).toBe('500_2000')
  })

  it('keeps approval and idempotency transport controls intact in framework adapters', async () => {
    const { calls, fetch } = captureFetch()
    const client = createNexezClient({ baseUrl: 'https://nexez.test', fetch })
    const tools = createVercelAiSdkTools((schema) => ({ schema }), client)

    await tools.nexez_start_checkout.execute({
      slug: 'acme',
      offer: 'services-0',
      approvalToken: 'approval-token',
      userApproved: true,
      idempotencyKey: 'framework-retry-1234567890',
      ignored: 'never-forwarded',
    })

    const headers = new Headers(calls[0].init?.headers)
    expect(headers.get('idempotency-key')).toBe('framework-retry-1234567890')
    expect(calls[0].body).toMatchObject({
      slug: 'acme',
      offer: 'services-0',
      approvalToken: 'approval-token',
      dryRun: false,
    })
    expect(calls[0].body).not.toHaveProperty('userApproved')
    expect(calls[0].body).not.toHaveProperty('idempotencyKey')
    expect(calls[0].body).not.toHaveProperty('ignored')
  })
})
