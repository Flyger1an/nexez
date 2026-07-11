import { NextResponse, after } from 'next/server'
import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../../../lib/artifact-cors'
import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { buildAgentPagePayload, buildAgentStorefrontRef } from '../../../lib/agent-manifest'
import { logAgentPageView } from '../../../lib/server/log-agent-page-view'
import { resolveNegotiationAllowed } from '../../../lib/server/negotiation-visibility'
import { loadReviewSummaryForSlug } from '../../../lib/server/reviews'
import { loadStorefrontHandleForSlug } from '../../../lib/server/storefront'
import { supabase } from '../../../lib/supabase'

/**
 * MCP discovery manifest (static) for /<slug>.
 * 
 * Model Context Protocol (MCP) friendly manifest for agents that support it.
 * Exposes the page's offers as MCP "resources" (with URIs, descriptions, mimeTypes)
 * and basic "tools" for booking (mirrors the action in agent.json/JSON-LD).
 * 
 * When the page has `mcp_enabled: true` (toggle in Settings), this is linked
 * from the public page + can be discovered alongside /agent.json, llms.txt, etc.
 * 
 * This is the STATIC discovery manifest — the LIVE JSON-RPC 2.0 MCP server runs at
 * /<slug>/mcp (surfaced below as `_nexez.mcp_endpoint`) and handles initialize,
 * tools/list, tools/call, resources/list, resources/read. Follows the same
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
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!page || !(page as any).mcp_enabled) {
    return NextResponse.json(
      { error: 'MCP not enabled for this page or page not found' },
      { status: 404 }
    )
  }

  // Log the MCP manifest fetch as agent traffic (non-blocking).
  after(() => logAgentPageView({ page, requestHeaders: request.headers, url: request.url }))

  // Prefer verified custom domain base when request host matches, else hardened canonical (prevents arbitrary reflection).
  let base = getRequestBaseUrl(request)
  if (page.custom_domain && page.custom_domain_verified) {
    const reqHost = (request.headers.get('host') || '').split(':')[0]
    if (reqHost === page.custom_domain || reqHost === `www.${page.custom_domain}`) {
      base = `https://${page.custom_domain}${page.domain_path || ''}`.replace(/\/$/, '')
    }
  }
  const negotiationAllowed = await resolveNegotiationAllowed(page)
  const [storefrontHandle, reviewSummary] = await Promise.all([
    loadStorefrontHandleForSlug(slug),
    loadReviewSummaryForSlug(slug, 3),
  ])
  const payload = buildAgentPagePayload(page, base, {
    negotiationAllowed,
    storefront: storefrontHandle ? buildAgentStorefrontRef(storefrontHandle) : null,
    reviewSummary,
  })

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
      ...(payload.storefront
        ? [
            {
              uri: payload.storefront.agent_json_url,
              name: 'Agent Storefront Manifest',
              description: 'Seller-level context and links to every published listing in this storefront.',
              mimeType: 'application/json',
            },
          ]
        : []),
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
      // negotiate_offer is only advertised when the owner's plan allows negotiation
      // AND the page has a negotiable offer - otherwise calling it would 403.
      ...(negotiationAllowed
        ? [
            {
              name: 'negotiate_offer',
              description: 'Submit proposed scope, budget, timeline, or buyer constraints for seller review before checkout or escrow.',
              inputSchema: {
                type: 'object',
                properties: {
                  slug: { type: 'string' },
                  offer: { type: 'string', description: 'e.g. services-0 or products-1' },
                  buyerAgent: { type: 'string' },
                  query: { type: 'string' },
                  requestedTerms: { type: 'object' },
                  budget: { type: 'string' },
                  timeline: { type: 'string' },
                  contact: { type: 'string' },
                },
                required: ['slug', 'offer'],
              },
            },
          ]
        : []),
    ],
    prompts: [],
    _nexez: {
      // Passthrough of the rich Nexez payload for agents that understand both MCP + Nexez format.
      nexez_payload: payload,
      public_url: `${base}/${slug}`,
      mcp_enabled: true,
      // Live JSON-RPC 2.0 MCP endpoint (initialize / tools/* / resources/*).
      mcp_endpoint: `${base}/${slug}/mcp`,
    },
  }

  return NextResponse.json(mcpManifest, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      // Base URL reflects the request host - vary the CDN cache key on it (this is
      // cached for 1h, the widest poisoning window of the artifacts).
      Vary: 'x-forwarded-host',
      ...ARTIFACT_CORS_HEADERS,
    },
  })
}

export function OPTIONS() {
  return artifactPreflight()
}
