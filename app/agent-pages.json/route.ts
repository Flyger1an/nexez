import { AgentPage, getCheckoutOffers, getCheckoutPath, getOfferCount, getRequestBaseUrl } from '../../lib/agent-page'
import { getAgentJsonPath } from '../../lib/agent-manifest'
import { supabase } from '../../lib/supabase'

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request)
  const { data: pages } = await supabase
    .from('pages')
    .select('name, slug, description, location, products, services, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<Pick<AgentPage, 'name' | 'slug' | 'description' | 'location' | 'products' | 'services' | 'created_at'>[]>()

  return Response.json(
    {
      schema_version: 'nexez.agent-index.v1',
      generated_at: new Date().toISOString(),
      llms_url: `${baseUrl}/llms.txt`,
      openapi_url: `${baseUrl}/openapi.json`,
      capabilities_url: `${baseUrl}/.well-known/nexez.json`,
      search_url: `${baseUrl}/api/agent-search?q={query}`,
      pages: (pages ?? []).map((page) => ({
        name: page.name,
        slug: page.slug,
        url: `${baseUrl}/${page.slug}`,
        agent_json_url: `${baseUrl}${getAgentJsonPath(page.slug)}`,
        description: page.description,
        location: page.location,
        offer_count: getOfferCount(page),
        checkout_urls: getCheckoutOffers(page).map((offer) => ({
          offer: offer.name,
          type: offer.kind === 'services' ? 'service' : 'product',
          url: `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
          action: {
            method: 'POST',
            endpoint: `${baseUrl}/api/checkout`,
            body: {
              slug: page.slug,
              offer: `${offer.kind}-${offer.index}`,
            },
            dry_run_body: {
              slug: page.slug,
              offer: `${offer.kind}-${offer.index}`,
              dryRun: true,
            },
          },
        })),
      })),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=120, s-maxage=300',
      },
    },
  )
}
