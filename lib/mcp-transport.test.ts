import { describe, expect, it } from 'vitest'
import {
  isAllowedMcpOrigin,
  MCP_PROTOCOL_VERSION,
  validateMcpRequest,
} from './mcp-transport'

function currentRequest(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
        'io.modelcontextprotocol/clientInfo': { name: 'Cursor', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }
  const request = new Request('https://nexez.app/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      'mcp-method': method,
      ...headers,
    },
    body: JSON.stringify(body),
  })
  return { request, body }
}

describe('MCP 2026-07-28 transport validation', () => {
  it('accepts the current stateless envelope and classifies the client', () => {
    const { request, body } = currentRequest('server/discover')
    expect(validateMcpRequest(request, body)).toEqual({ ok: true, modern: true, clientFamily: 'cursor' })
  })

  it('keeps requests without current metadata on the legacy path', () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'OpenClaw' } } }
    const request = new Request('https://nexez.app/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(validateMcpRequest(request, body)).toEqual({ ok: true, modern: false, clientFamily: 'openclaw' })
  })

  it('rejects malformed JSON-RPC before dispatch', () => {
    const body = { id: 1, method: 'tools/list', params: {} }
    const request = new Request('https://nexez.app/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = validateMcpRequest(request, body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.body.error.code).toBe(-32600)
  })

  it('returns the reserved error for a mismatched protocol version', () => {
    const { request, body } = currentRequest('tools/list', {}, { 'mcp-protocol-version': '2026-06-01' })
    const result = validateMcpRequest(request, body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.body.error.code).toBe(-32020)
  })

  it('returns supported versions for an unsupported but matching version', () => {
    const { request, body } = currentRequest('tools/list')
    body.params._meta['io.modelcontextprotocol/protocolVersion'] = '2026-06-01'
    const unsupported = new Request(request.url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-06-01',
        'mcp-method': 'tools/list',
      },
      body: JSON.stringify(body),
    })
    const result = validateMcpRequest(unsupported, body)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.body.error.code).toBe(-32022)
      expect(result.error.body.error.data).toEqual({ supported: [MCP_PROTOCOL_VERSION], requested: '2026-06-01' })
    }
  })

  it('decodes the Base64 sentinel before comparing Mcp-Name', () => {
    const uri = 'https://nexez.app/über'
    const encoded = Buffer.from(uri).toString('base64')
    const { request, body } = currentRequest('resources/read', { uri }, { 'mcp-name': `=?base64?${encoded}?=` })
    expect(validateMcpRequest(request, body).ok).toBe(true)
  })

  it('rejects a missing or incorrect Mcp-Name', () => {
    const { request, body } = currentRequest('tools/call', { name: 'nexez_search', arguments: { q: 'plumber' } })
    const result = validateMcpRequest(request, body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.body.error.code).toBe(-32020)
  })

  it('allows Nexez and local development origins only', () => {
    expect(isAllowedMcpOrigin(null)).toBe(true)
    expect(isAllowedMcpOrigin('https://nexez.ai')).toBe(true)
    expect(isAllowedMcpOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedMcpOrigin('https://evil.example')).toBe(false)
  })
})
