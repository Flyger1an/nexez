import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MCP_LEGACY_PROTOCOL_VERSION, MCP_PROTOCOL_VERSION } from '../../lib/mcp-transport'

let limited = false
const handle = vi.hoisted(() => vi.fn(async (request: { id?: unknown; method?: string }) => ({
  jsonrpc: '2.0' as const,
  id: request.id ?? null,
  result: { echoed: request.method },
})))
const schedule = vi.hoisted(() => vi.fn())

vi.mock('../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (limited ? new Response('rate', { status: 429 }) : null)),
  clientIp: vi.fn(() => '1.2.3.4'),
}))
vi.mock('../../lib/mcp-platform', () => ({ handlePlatformMcpRequest: handle }))
vi.mock('../../lib/server/mcp-demand', () => ({ scheduleMcpDemandEvent: schedule }))

import { DELETE, GET, POST } from './route'

const legacyPost = (body: unknown, headers: Record<string, string> = {}) => POST(new Request('https://nexez.app/mcp', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}))

const modernBody = (method: string, params: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0',
  id: 9,
  method,
  params: {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
      'io.modelcontextprotocol/clientInfo': { name: 'Claude Desktop', version: '1.0.0' },
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  },
})

const modernPost = (method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) => legacyPost(
  modernBody(method, params),
  {
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    'mcp-method': method,
    ...(method === 'tools/call' && typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
    ...(method === 'resources/read' && typeof params.uri === 'string' ? { 'mcp-name': params.uri } : {}),
    ...headers,
  },
)

const legacyStreamablePost = (method: string, params: Record<string, unknown> = {}) => legacyPost(
  { jsonrpc: '2.0', id: 7, method, params },
  {
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_LEGACY_PROTOCOL_VERSION,
    'user-agent': 'MCP Inspector',
  },
)

describe('/mcp platform route', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    limited = false
    handle.mockClear()
    schedule.mockClear()
  })

  it('rejects GET and DELETE because current MCP is POST-only', async () => {
    const get = await GET()
    const remove = await DELETE()
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    expect(remove.status).toBe(405)
  })

  it('returns 429 before dispatch when rate-limited', async () => {
    limited = true
    expect((await legacyPost({ id: 1, method: 'initialize' })).status).toBe(429)
  })

  it('returns -32700 on malformed JSON', async () => {
    const response = await legacyPost('{bad')
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe(-32700)
  })

  it('keeps the bounded batch path for legacy clients only', async () => {
    expect((await legacyPost(Array.from({ length: 26 }, (_, index) => ({ jsonrpc: '2.0', id: index, method: 'ping' })))).status).toBe(413)
    const body = await (await legacyPost([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ])).json()
    expect(body).toHaveLength(2)
    const modernBatch = await legacyPost(
      [modernBody('ping'), modernBody('tools/list')],
      { 'mcp-protocol-version': MCP_PROTOCOL_VERSION },
    )
    expect(modernBatch.status).toBe(400)
  })

  it('dispatches a current stateless request with bounded client attribution', async () => {
    const response = await modernPost('tools/list')
    expect(response.status).toBe(200)
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'tools/list' }),
      'https://nexez.test',
      expect.objectContaining({ modern: true, clientFamily: 'claude', clientIp: '1.2.3.4' }),
    )
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'tools_list',
      clientFamily: 'claude',
      outcome: 'handled',
    }))
  })

  it('dispatches a 2025-era Streamable HTTP request on the compatibility path', async () => {
    const response = await legacyStreamablePost('tools/list')
    expect(response.status).toBe(200)
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'tools/list' }),
      'https://nexez.test',
      expect.objectContaining({ modern: false, clientFamily: 'mcp_inspector', clientIp: '1.2.3.4' }),
    )
  })

  it('rejects missing standard headers with HeaderMismatch', async () => {
    const response = await legacyPost(modernBody('tools/list'), {
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    })
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe(-32020)
    expect(handle).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown current RPC method', async () => {
    expect((await modernPost('unknown/method')).status).toBe(404)
  })

  it('rejects cross-origin browser traffic before dispatch', async () => {
    const response = await modernPost('tools/list', {}, { origin: 'https://evil.example' })
    expect(response.status).toBe(403)
    expect(handle).not.toHaveBeenCalled()
  })

  it('does not count the signed Launch Control health probe as demand', async () => {
    vi.stubEnv('CRON_SECRET', 'launch-control-probe-secret')
    const response = await modernPost('server/discover', {}, {
      'x-nexez-internal-probe': 'launch-control-probe-secret',
    })
    expect(response.status).toBe(200)
    expect(handle).toHaveBeenCalledOnce()
    expect(schedule).not.toHaveBeenCalled()
  })
})
