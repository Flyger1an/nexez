import { NextResponse } from 'next/server'
import { AgentPage, getBaseUrl } from '../../../lib/agent-page'
import { buildAgentPagePayload } from '../../../lib/agent-manifest'
import { supabase } from '../../../lib/supabase'

/**
 * Phase 7: MCP-compatible structured data export.
 * 
 * Model Context Protocol (MCP) friendly manifest for agents that support it.
 * Exposes the page's offers as MCP "resources" (with URIs, descriptions, mimeTypes)
 * and basic "tools" for booking (mirrors the action in agent.json/JSON-LD).
 * 
 * When the page has `mcp_enabled: true` (toggle in Settings), this is linked
 * from the public page + can be discovered alongside /agent.json, llms.txt, etc.
 * 
 * Data-only for now (no full MCP server transport). Follows the same
 * deterministic, fidelity-preserving patterns as agent.json.
 * 
 * Route: GET /<slug>/mcp.json (public, published pages only, cached).
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const { data: page } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!page || !(page as any).mcp_enabled) {
    return NextResponse.json(
      { error: 'MCP not enabled for this page or page not found' },
      { status: 404 }
    )
  }

  const base = getBaseUrl()
  const payload = buildAgentPagePayload(page)

  // MCP-flavored wrapper: resources for offers + context, tools for actions.
  // Agents supporting MCP can use this as context/resources.
  const mcpManifest = {
    protocol_version: 'mcp/2024-11-05', // example; update as spec evolves
    server_info: {
      name: 'Nexez',
      version: '1.0.0',
      description: 'Nexez agent-optimized page exposed via MCP resources/tools',
    },
    capabilities: {
      resources: { subscribe: false, listChanged: false },
      tools: { listChanged: false },
    },
    resources: [
      {
        uri: `${base}/${slug}/agent.json`,
        name: 'Agent JSON Manifest',
        description: 'Full structured agent-ready data including offers, availability, and actions.',
        mimeType: 'application/json',
      },
      {
        uri: `${base}/llms.txt`,
        name: 'LLM Instructions',
        description: 'Plain-text instructions optimized for LLMs/agents.',
        mimeType: 'text/plain',
      },
      ... (payload.offers || []).map((offer: any, idx: number) => ({
        uri: `${base}/${slug}#offer-${idx}`,
        name: offer.name,
        description: offer.description || offer.name,
        mimeType: 'application/json',
        metadata: {
          price: offer.price,
          type: offer.type,
          checkout: offer.action?.endpoint,
          prefersOriginal: !!offer.prefersOriginal || (page as any).prefer_original_site,
        },
      })),
    ],
    tools: [
      {
        name: 'book_offer',
        description: 'Book or purchase a specific offer via the Nexez agent checkout or original site (respects per-offer and page prefer_original settings).',
        inputSchema: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            offer: { type: 'string', description: 'e.g. services-0 or products-1' },
            query: { type: 'string', description: 'Optional buyer context or agent query' },
          },
          required: ['slug', 'offer'],
        },
      },
    ],
    prompts: [],
    _nexez: {
      // Passthrough of the rich Nexez payload for agents that understand both MCP + Nexez format.
      nexez_payload: payload,
      public_url: `${base}/${slug}`,
      mcp_enabled: true,
    },
  }

  return NextResponse.json(mcpManifest, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  })
}
