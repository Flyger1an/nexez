import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handlePlatformMcpRequest } from '../mcp-platform'

const calls: { url: string; init?: RequestInit }[] = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (String(url).includes('/unknown-slug/agent.json')) return new Response(JSON.stringify({ error: 'nf' }), { status: 404 })
      return new Response(JSON.stringify({ ok: true, echo: String(url) }), { status: 200 })
    }),
  )
})

const base = 'https://nexez.app'
const call = (method: string, params?: Record<string, unknown>) =>
  handlePlatformMcpRequest({ id: 1, method, params }, base, { clientIp: '1.2.3.4' })

describe('handlePlatformMcpRequest', () => {
  it('initialize → nexez:platform serverInfo', async () => {
    const r = await call('initialize')
    const info = (r.result as {
      serverInfo: { name: string; title: string; description: string; websiteUrl: string; icons: { src: string }[] }
    }).serverInfo
    expect(info.name).toBe('nexez:platform')
    expect(info.title).toBe('Nexez Agentic Commerce')
    expect(info.description).toContain('structured offers')
    expect(info.websiteUrl).toBe('https://nexez.ai/agents')
    expect(info.icons[0].src).toBe('https://nexez.ai/icon.png')
  })

  it('tools/list exposes ONLY the 5 read/dry-run tools (no start_checkout / submit_negotiation)', async () => {
    const names = ((await call('tools/list')).result as { tools: { name: string }[] }).tools.map((t) => t.name)
    expect(names.sort()).toEqual(['nexez_directory', 'nexez_get_page', 'nexez_search', 'nexez_validate_checkout', 'nexez_validate_negotiation'])
    expect(names).not.toContain('nexez_start_checkout')
    expect(names).not.toContain('nexez_submit_negotiation')
  })

  it('nexez_search forwards to agent-search with the caller IP', async () => {
    const r = await call('tools/call', { name: 'nexez_search', arguments: { q: 'plumber', limit: 5 } })
    expect(calls[0].url).toContain('/api/agent-search')
    expect(calls[0].url).toContain('q=plumber')
    expect((calls[0].init?.headers as Record<string, string>)['x-forwarded-for']).toBe('1.2.3.4')
    expect((r.result as { content: { type: string }[] }).content[0].type).toBe('text')
  })

  it('nexez_get_page requires slug and maps a 404 → -32602', async () => {
    expect((await call('tools/call', { name: 'nexez_get_page', arguments: {} })).error?.code).toBe(-32602)
    expect((await call('tools/call', { name: 'nexez_get_page', arguments: { slug: 'unknown-slug' } })).error?.code).toBe(-32602)
    const good = await call('tools/call', { name: 'nexez_get_page', arguments: { slug: 'acme' } })
    expect((good.result as { content: unknown }).content).toBeTruthy()
  })

  it('validate_checkout ALWAYS forces dryRun:true (can never be turned into a real charge)', async () => {
    await call('tools/call', { name: 'nexez_validate_checkout', arguments: { slug: 'acme', offer: 'services-0', dryRun: false } })
    expect(calls[0].url).toContain('/api/checkout')
    expect(JSON.parse(String(calls[0].init?.body)).dryRun).toBe(true)
  })

  it('validate_negotiation forces dryRun:true', async () => {
    await call('tools/call', { name: 'nexez_validate_negotiation', arguments: { slug: 'acme', offer: 'services-0', dryRun: false } })
    expect(JSON.parse(String(calls[0].init?.body)).dryRun).toBe(true)
  })

  it('unknown tool → -32601, unknown method → -32601', async () => {
    expect((await call('tools/call', { name: 'nope' })).error?.code).toBe(-32601)
    expect((await call('bogus')).error?.code).toBe(-32601)
  })
})
