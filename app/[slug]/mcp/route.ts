import { NextResponse } from 'next/server'
import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { MCP_PROTOCOL_VERSION, handleMcpRequest } from '../../../lib/mcp-server'
import { supabase } from '../../../lib/supabase'

/**
 * Real MCP endpoint (JSON-RPC 2.0 over HTTP) at /<slug>/mcp.
 * MCP-native agents POST { jsonrpc, id, method, params }. GET returns a hint.
 * Only enabled when the page has mcp_enabled.
 */
async function loadPage(slug: string) {
  const { data } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()
  return data
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await loadPage(slug)
  if (!page || !(page as { mcp_enabled?: boolean }).mcp_enabled) {
    return NextResponse.json({ error: 'MCP not enabled for this page.' }, { status: 404 })
  }
  return NextResponse.json({
    transport: 'http-jsonrpc',
    protocolVersion: MCP_PROTOCOL_VERSION,
    hint: 'POST JSON-RPC 2.0 requests here: initialize, tools/list, tools/call, resources/list, resources/read.',
    static_manifest: `${getRequestBaseUrl(request)}/${slug}/mcp.json`,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await loadPage(slug)
  if (!page || !(page as { mcp_enabled?: boolean }).mcp_enabled) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32601, message: 'MCP not enabled for this page.' } },
      { status: 404 },
    )
  }

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
  // Support a single request or a JSON-RPC batch.
  if (Array.isArray(body)) {
    return NextResponse.json(body.map((req) => handleMcpRequest(page, base, req)))
  }
  return NextResponse.json(handleMcpRequest(page, base, body as Record<string, unknown>))
}
