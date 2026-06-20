import { AgentPage, getCertification, getCheckoutOffers, getCheckoutPath, getOfferCount, getRequestBaseUrl } from '../../lib/agent-page'
import { buildAgentStorefrontRef, getAgentJsonPath } from '../../lib/agent-manifest'
import { buildAgentDistributionLinks } from '../../lib/agent-distribution'
import { normalizeCurrency } from '../../lib/currency'
import { publicLaunchVisiblePages } from '../../lib/public-page-visibility'
import { loadStorefrontHandlesForSlugs } from '../../lib/server/storefront'
import { supabase } from '../../lib/supabase'

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request)
  const distribution = buildAgentDistributionLinks(baseUrl)
  // Select enough to compute price/currency + an accurate readiness/trust signal,
  // so agents can shortlist from the index without fetching every per-page manifest.
  const { data: pages } = await supabase
    .from('pages_public')
    .select('name, slug, description, location, products, services, created_at, currency, website_url, cta_url, audience, industry, contact_email, faqs, is_published')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  const visiblePages = publicLaunchVisiblePages(pages)
  const storefrontHandles = await loadStorefrontHandlesForSlugs(visiblePages.map((page) => page.slug))

  return Response.json(
    {
      schema_version: 'nexez.agent-index.v1',
      generated_at: new Date().toISOString(),
      agent_access_url: distribution.docs_url,
      llms_url: `${baseUrl}/llms.txt`,
      openapi_url: `${baseUrl}/openapi.json`,
      capabilities_url: `${baseUrl}/.well-known/nexez.json`,
      search_url: `${baseUrl}/api/agent-search?q={query}`,
      openclaw: distribution.openclaw,
      sdks: distribution.sdks,
      examples: distribution.examples,
      pages: visiblePages.map((page) => {
        const cert = getCertification(page)
        const currency = normalizeCurrency(page.currency)
        const storefrontHandle = storefrontHandles.get(page.slug)
        const storefront = storefrontHandle ? buildAgentStorefrontRef(storefrontHandle, baseUrl) : null
        return {
          name: page.name,
          slug: page.slug,
          url: `${baseUrl}/${page.slug}`,
          agent_json_url: `${baseUrl}${getAgentJsonPath(page.slug)}`,
          ...(storefront
            ? {
                storefront_handle: storefront.handle,
                storefront_url: storefront.url,
                storefront_agent_json_url: storefront.agent_json_url,
              }
            : {}),
          description: page.description,
          location: page.location,
          industry: page.industry ?? null,
          currency,
          readiness: cert.readiness,
          certified: cert.certified,
          offer_count: getOfferCount(page),
          checkout_urls: getCheckoutOffers(page).map((offer) => ({
            offer: offer.name,
            type: offer.kind === 'services' ? 'service' : 'product',
            price: offer.price || null,
            currency,
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
        }
      }),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=120, s-maxage=300',
        // Base URL reflects the request host — vary the CDN cache key on it.
        Vary: 'x-forwarded-host',
      },
    },
  )
}
