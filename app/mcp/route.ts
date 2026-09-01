import { randomUUID, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getRequestBaseUrl } from '../../lib/agent-page'
import {
  buildMcpBuyerAgent,
  mcpEventType,
  mcpHandoffKind,
  MCP_TOOL_NAMES,
  type McpToolName,
} from '../../lib/mcp-demand'
import { handlePlatformMcpRequest } from '../../lib/mcp-platform'
import type { PlatformMcpSurface } from '../../lib/mcp-platform'
import {
  isAllowedMcpOrigin,
  MCP_PROTOCOL_VERSION,
  validateMcpRequest,
  type McpJsonRpcRequest,
} from '../../lib/mcp-transport'
import { clientIp, enforceRateLimit } from '../../lib/rate-limit'
import { scheduleMcpDemandEvent } from '../../lib/server/mcp-demand'

export const maxDuration = 30

const MCP_MAX_LEGACY_BATCH = 25
const MODERN_METHODS = new Set([
  'server/discover',
  'ping',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/read',
])

/**
 * Canonical public MCP server. Current MCP is stateless POST-only. The legacy
 * initialize and bounded batch path remains available for existing clients
 * that do not send the 2026-07-28 request envelope.
 */
export async function GET() {
  return methodNotAllowed()
}

export async function DELETE() {
  return methodNotAllowed()
}

export async function POST(request: Request) {
  const surface: PlatformMcpSurface = new URL(request.url).pathname.replace(/\/+$/, '') === '/mcp/chatgpt'
    ? 'chatgpt'
    : 'platform'
  if (!isAllowedMcpOrigin(request.headers.get('origin'))) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Origin is not allowed.' } },
      { status: 403 },
    )
  }

  const limited = await enforceRateLimit(request, surface === 'chatgpt' ? 'chatgpt-mcp' : 'platform-mcp', 60, 60_000)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 },
    )
  }

  const base = getRequestBaseUrl(request)
  const callerIp = clientIp(request) || undefined
  const recordEvidence = !isInternalMcpProbe(request)

  if (Array.isArray(body)) {
    if (request.headers.has('mcp-protocol-version')) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Current MCP accepts one JSON-RPC request per POST.' } },
        { status: 400 },
      )
    }
    if (!body.length || body.length > MCP_MAX_LEGACY_BATCH) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: body.length
              ? `Batch too large (max ${MCP_MAX_LEGACY_BATCH} requests).`
              : 'An empty JSON-RPC batch is invalid.',
          },
        },
        { status: body.length ? 413 : 400 },
      )
    }
    const results = await Promise.all(body.map((item) => dispatchMcpRequest(
      request,
      item as McpJsonRpcRequest,
      base,
      callerIp,
      recordEvidence,
      surface,
    )))
    const responses = results
      .filter((result) => result.status !== 202)
      .map((result) => result.body)
    return responses.length
      ? NextResponse.json(responses)
      : new Response(null, { status: 202 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
      { status: 400 },
    )
  }
  const dispatched = await dispatchMcpRequest(request, body as McpJsonRpcRequest, base, callerIp, recordEvidence, surface)
  if (dispatched.status === 202) return new Response(null, { status: 202 })
  return NextResponse.json(dispatched.body, { status: dispatched.status })
}

async function dispatchMcpRequest(
  request: Request,
  body: McpJsonRpcRequest,
  baseUrl: string,
  callerIp: string | undefined,
  recordEvidence: boolean,
  surface: PlatformMcpSurface,
): Promise<{ status: number; body: unknown }> {
  const validation = validateMcpRequest(request, body)
  const method = typeof body.method === 'string' ? body.method : ''
  const eventType = mcpEventType(method)
  const toolName = validToolName(body.params?.name)

  if (!validation.ok) {
    if (recordEvidence && eventType && (eventType !== 'tool_call' || toolName)) {
      scheduleMcpDemandEvent({
        eventType,
        toolName,
        clientFamily: validation.clientFamily,
        outcome: 'protocol_error',
      })
    }
    return { status: validation.error.status, body: validation.error.body }
  }

  // Streamable HTTP notifications do not receive JSON-RPC responses. Accept
  // lifecycle and other valid notifications without dispatching a reply body.
  if (!Object.prototype.hasOwnProperty.call(body, 'id')) {
    return { status: 202, body: null }
  }

  const handoffKind = surface === 'chatgpt' ? null : mcpHandoffKind(toolName)
  const attributionId = handoffKind ? randomUUID() : undefined
  const buyerAgent = attributionId
    ? buildMcpBuyerAgent(validation.clientFamily, attributionId) ?? undefined
    : undefined
  const response = await handlePlatformMcpRequest(body, baseUrl, {
    clientIp: callerIp,
    modern: validation.modern,
    clientFamily: validation.clientFamily,
    buyerAgent,
    attributionId,
    surface,
  })

  if (recordEvidence && eventType && (eventType !== 'tool_call' || toolName)) {
    const actionReady = handoffKind ? responseHasMcpHandoff(response) : false
    scheduleMcpDemandEvent({
      eventType,
      toolName,
      clientFamily: validation.clientFamily,
      outcome: response.error?.code === -32603 ? 'upstream_error' : 'handled',
      actionReady,
      handoffKind,
      attributionId: attributionId ?? null,
    })
  }

  return {
    status: validation.modern && !MODERN_METHODS.has(method) ? 404 : 200,
    body: response,
  }
}

function responseHasMcpHandoff(response: Awaited<ReturnType<typeof handlePlatformMcpRequest>>): boolean {
  if (!response.result || typeof response.result !== 'object' || Array.isArray(response.result)) return false
  const content = (response.result as { content?: unknown }).content
  if (!Array.isArray(content)) return false
  return content.some((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const text = (item as { text?: unknown }).text
    if (typeof text !== 'string') return false
    try {
      const body = JSON.parse(text) as { mcpHandoff?: unknown }
      return Boolean(body.mcpHandoff)
    } catch {
      return false
    }
  })
}

function validToolName(value: unknown): McpToolName | null {
  return typeof value === 'string' && (MCP_TOOL_NAMES as readonly string[]).includes(value)
    ? value as McpToolName
    : null
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      error: 'Use POST for stateless MCP requests.',
      protocolVersion: MCP_PROTOCOL_VERSION,
      discoverMethod: 'server/discover',
      staticManifest: 'https://nexez.app/.well-known/mcp.json',
    },
    { status: 405, headers: { allow: 'POST' } },
  )
}

function isInternalMcpProbe(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || ''
  const supplied = request.headers.get('x-nexez-internal-probe') || ''
  if (!expected || !supplied) return false
  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer)
}
