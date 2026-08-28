import { NextResponse } from 'next/server'
import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { MCP_PROTOCOL_VERSION, handleMcpRequest } from '../../../lib/mcp-server'
import { resolveNegotiationAllowed } from '../../../lib/server/negotiation-visibility'
import { supabase } from '../../../lib/supabase'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { agentArtifactHref, normalizeDomainPath } from '../../../lib/custom-domain'
import { renamedPageArtifactRedirect } from '../../../lib/server/public-identifier'

// Cap on JSON-RPC batch size - an unbounded array was a single-request
// amplification DoS (~194x) on this unauthenticated endpoint (red-team gauntlet).
const MCP_MAX_BATCH = 25

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
  if (!page) {
    const redirect = await renamedPageArtifactRedirect(request, slug)
    if (redirect) return redirect
  }
  if (!page || !(page as { mcp_enabled?: boolean }).mcp_enabled) {
    return NextResponse.json({ error: 'MCP not enabled for this listing.' }, { status: 404 })
  }
  const base = getRequestBaseUrl(request)
  const onCustom = !!(page.custom_domain && page.custom_domain_verified)
  const reqHost = (request.headers.get('host') || '').split(':')[0]
  const isOnCustom = onCustom && (reqHost === page.custom_domain || reqHost === `www.${page.custom_domain}`)
  const manifestBase = isOnCustom ? `https://${page.custom_domain}${normalizeDomainPath((page as any).domain_path)}`.replace(/\/$/, '') : base
  const staticManifest = `${manifestBase}${agentArtifactHref('mcp.json', slug, isOnCustom, normalizeDomainPath((page as any).domain_path))}`
  return NextResponse.json({
    transport: 'http-jsonrpc',
    protocolVersion: MCP_PROTOCOL_VERSION,
    hint: 'POST JSON-RPC 2.0 requests here: initialize, tools/list, tools/call, resources/list, resources/read.',
    static_manifest: staticManifest,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await enforceRateLimit(request, 'mcp', 60, 60_000)
  if (limited) return limited

  const { slug } = await params
  const page = await loadPage(slug)
  if (!page) {
    const redirect = await renamedPageArtifactRedirect(request, slug)
    if (redirect) return redirect
  }
  if (!page || !(page as { mcp_enabled?: boolean }).mcp_enabled) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32601, message: 'MCP not enabled for this listing.' } },
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
  // Resolve negotiation entitlement once (async) and thread it into the pure
  // handler so the advertised tools + tools/call match the gated POST endpoint.
  const negotiationAllowed = await resolveNegotiationAllowed(page)
  // Support a single request or a JSON-RPC batch (bounded - an unbounded batch was
  // a single-request amplification DoS).
  if (Array.isArray(body)) {
    if (body.length > MCP_MAX_BATCH) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: `Batch too large (max ${MCP_MAX_BATCH} requests).` } },
        { status: 413 },
      )
    }
    return NextResponse.json(body.map((req) => handleMcpRequest(page, base, req, { negotiationAllowed })))
  }
  return NextResponse.json(handleMcpRequest(page, base, body as Record<string, unknown>, { negotiationAllowed }))
}
