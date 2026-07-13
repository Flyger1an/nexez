import { getBaseUrl, getCheckoutOffers, getCheckoutOfferKey } from '../../../../lib/agent-page'
import { loadStorefrontByHandle } from '../../../../lib/server/storefront'
import { ownerAllows } from '../../../../lib/server/plan'
import { createAdminClient } from '../../../../utils/supabase/admin'

type RouteProps = { params: Promise<{ handle: string }> }

/**
 * Storefront MCP manifest at /store/<handle>/mcp.json — the static discovery
 * document for MCP clients that read manifests. Points at the live JSON-RPC
 * endpoint (`_nexez.mcp_endpoint`) and aggregates every published listing's
 * resources. Curated fields only (never raw products/services/rules).
 */
export async function GET(_request: Request, { params }: RouteProps) {
  const { handle } = await params
  const resolved = await loadStorefrontByHandle(handle)
  if (!resolved) return new Response('Not found', { status: 404 })

  const { storefront, listings } = resolved
  const base = getBaseUrl()
  const storefrontUrl = `${base}/store/${storefront.handle}`

  const anyNegotiable = listings.some((p) =>
    getCheckoutOffers(p).some((o) => (o as { offerType?: string }).offerType === 'negotiable'),
  )
  const negotiationAllowed = anyNegotiable
    ? await ownerAllows(createAdminClient(), storefront.owner_id, 'negotiation')
    : false

  const resources = [
    {
      uri: `${storefrontUrl}/agent.json`,
      name: `Storefront manifest (@${storefront.handle})`,
      description: 'Seller-level catalog: brand + links to every published listing.',
      mimeType: 'application/json',
    },
    ...listings.flatMap((page) => [
      {
        uri: `${base}/${page.slug}/agent.json`,
        name: `${page.name} - Agent manifest`,
        description: 'Full structured agent-ready data for this listing.',
        mimeType: 'application/json',
      },
      ...getCheckoutOffers(page).map((offer) => ({
        uri: `${base}/${page.slug}#${getCheckoutOfferKey(offer.kind, offer.index)}`,
        name: `${page.name}: ${offer.name}`,
        description: offer.description || offer.name,
        mimeType: 'application/json',
        metadata: { slug: page.slug, offer: getCheckoutOfferKey(offer.kind, offer.index), price: offer.price },
      })),
    ]),
  ]

  const tools = [
    {
      name: 'book_offer',
      description: 'Get the booking/checkout target for a specific offer in one of this storefront’s listings.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Listing slug within this storefront' },
          offer: { type: 'string', description: 'e.g. services-0 or products-1' },
        },
        required: ['slug', 'offer'],
      },
    },
    ...(negotiationAllowed
      ? [
          {
            name: 'negotiate_offer',
            description: 'Submit a proposal (scope, budget, timeline) for a listing’s offer for seller review before checkout/escrow.',
            inputSchema: {
              type: 'object',
              properties: {
                slug: { type: 'string' },
                offer: { type: 'string' },
                query: { type: 'string' },
                budget: { type: 'string' },
                timeline: { type: 'string' },
              },
              required: ['slug', 'offer'],
            },
          },
        ]
      : []),
  ]

  const manifest = {
    protocol_version: 'mcp/2024-11-05',
    server_info: {
      name: 'Nexez',
      version: '1.0.0',
      description: `Nexez storefront @${storefront.handle} — all listings exposed via MCP resources/tools`,
    },
    capabilities: {
      resources: { subscribe: false, listChanged: false },
      tools: { listChanged: false },
    },
    resources,
    tools,
    prompts: [],
    _nexez: {
      storefront: storefront.handle,
      storefront_url: storefrontUrl,
      listings_count: listings.length,
      // Live JSON-RPC 2.0 MCP endpoint (initialize / tools/* / resources/*).
      mcp_endpoint: `${storefrontUrl}/mcp`,
    },
  }

  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      Vary: 'x-forwarded-host',
      // Out of Google's index; agents still fetch/crawl this freely.
      'X-Robots-Tag': 'noindex',
    },
  })
}
