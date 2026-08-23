import { NextResponse } from 'next/server'
import { getRequestBaseUrl } from '../../lib/agent-page'
import { MCP_PROTOCOL_VERSION } from '../../lib/mcp-server'
import { handlePlatformMcpRequest } from '../../lib/mcp-platform'
import { clientIp, enforceRateLimit } from '../../lib/rate-limit'

// One page fetch + up to a handful of forwarded REST calls per batch.
export const maxDuration = 30

// Same bounded-batch DoS guard as the per-listing/storefront MCP endpoints.
const MCP_MAX_BATCH = 25

/**
 * The canonical PLATFORM MCP endpoint (JSON-RPC 2.0 over HTTP) at nexez.app/mcp.
 * One stable, discovery-first server for the whole Nexez catalog - search,
 * directory, get_page, and dry-run checkout/negotiation validation. GET returns a
 * transport hint; POST handles single requests or a bounded batch.
 */
export async function GET(request: Request) {
  const base = getRequestBaseUrl(request)
  return NextResponse.json({
    transport: 'http-jsonrpc',
    protocolVersion: MCP_PROTOCOL_VERSION,
    hint: 'POST JSON-RPC 2.0 requests here: initialize, tools/list, tools/call, resources/list, resources/read.',
    static_manifest: `${base}/.well-known/mcp.json`,
  })
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'platform-mcp', 60, 60_000)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }

  const base = getRequestBaseUrl(request)
  // Forward the SANITIZED caller identity (leftmost trusted value) so the inner
  // endpoints' rate limits key per buyer-agent, not the raw spoofable header.
  const callerIp = clientIp(request) || undefined

  if (Array.isArray(body)) {
    if (body.length > MCP_MAX_BATCH) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: `Batch too large (max ${MCP_MAX_BATCH} requests).` } },
        { status: 413 },
      )
    }
    const results = await Promise.all(body.map((r) => handlePlatformMcpRequest(r as Record<string, unknown>, base, { clientIp: callerIp })))
    return NextResponse.json(results)
  }
  return NextResponse.json(await handlePlatformMcpRequest(body as Record<string, unknown>, base, { clientIp: callerIp }))
}
