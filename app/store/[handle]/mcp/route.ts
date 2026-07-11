import { NextResponse } from 'next/server'
import { getBaseUrl, getCheckoutOffers } from '../../../../lib/agent-page'
import { MCP_PROTOCOL_VERSION, handleStorefrontMcpRequest } from '../../../../lib/mcp-server'
import { loadStorefrontByHandle } from '../../../../lib/server/storefront'
import { ownerAllows } from '../../../../lib/server/plan'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { createAdminClient } from '../../../../utils/supabase/admin'

// Same bounded-batch DoS guard as the per-listing MCP endpoint. A distinct
// rate-limit bucket because one storefront call fans out over N listings.
const MCP_MAX_BATCH = 25

/**
 * Per-merchant MCP endpoint (JSON-RPC 2.0 over HTTP) at /store/<handle>/mcp.
 * Aggregates ALL of a seller's published listings so an MCP-native agent can
 * discover + transact across the whole catalog from one URL. Always-on for any
 * storefront with published listings (no separate mcp_enabled flag).
 */
async function load(handle: string) {
  const resolved = await loadStorefrontByHandle(handle)
  if (!resolved) return null
  // loadStorefrontByHandle already returns listings:[] for a billing-paused
  // owner — consume it verbatim; never re-query pages (that would leak paused
  // listings). Negotiation is owner-level, so resolve once (not per listing).
  const anyNegotiable = resolved.listings.some((p) =>
    getCheckoutOffers(p).some((o) => (o as { offerType?: string }).offerType === 'negotiable'),
  )
  const negotiationAllowed = anyNegotiable
    ? await ownerAllows(createAdminClient(), resolved.storefront.owner_id, 'negotiation')
    : false
  return { ...resolved, negotiationAllowed }
}

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const resolved = await loadStorefrontByHandle(handle)
  if (!resolved) return NextResponse.json({ error: 'Storefront not found.' }, { status: 404 })
  const base = getBaseUrl()
  return NextResponse.json({
    transport: 'http-jsonrpc',
    protocolVersion: MCP_PROTOCOL_VERSION,
    hint: 'POST JSON-RPC 2.0 requests here: initialize, tools/list, tools/call, resources/list, resources/read.',
    static_manifest: `${base}/store/${resolved.storefront.handle}/mcp.json`,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const limited = await enforceRateLimit(request, 'storefront-mcp', 60, 60_000)
  if (limited) return limited

  const { handle } = await params
  const resolved = await load(handle)
  if (!resolved) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Storefront not found.' } },
      { status: 404 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }

  const base = getBaseUrl()
  const { storefront, listings, negotiationAllowed } = resolved

  if (Array.isArray(body)) {
    if (body.length > MCP_MAX_BATCH) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: `Batch too large (max ${MCP_MAX_BATCH} requests).` } },
        { status: 413 },
      )
    }
    return NextResponse.json(
      body.map((req) => handleStorefrontMcpRequest(storefront.handle, listings, base, req, { negotiationAllowed })),
    )
  }
  return NextResponse.json(
    handleStorefrontMcpRequest(storefront.handle, listings, base, body as Record<string, unknown>, { negotiationAllowed }),
  )
}
