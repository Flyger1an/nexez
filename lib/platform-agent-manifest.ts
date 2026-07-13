import { billingPlans } from './billing'
import { agentRuntimeUrl, appUrl, marketingUrl } from './site'

// Stable content date for the homepage structured data (a per-render timestamp
// would falsely signal "always fresh" to crawlers). Update when the advertised
// platform content meaningfully changes.
const PLATFORM_CONTENT_DATE = '2026-07-13'

// Display prices in the billing catalog are strings like '$19'.
function planPriceNumber(price: string): number {
  return Number(price.replace(/[^0-9.]/g, ''))
}

/** Root discovery document for Nexez as an agent-commerce platform. */
export function buildPlatformAgentManifest() {
  return {
    schema_version: '1.0',
    name: 'Nexez',
    description: 'Agent-readable business offers with discovery, comparison, negotiation, checkout, booking, and attribution.',
    url: marketingUrl('/'),
    provider: {
      name: 'Nexez',
      support_url: marketingUrl('/support'),
      terms_url: marketingUrl('/terms'),
      privacy_url: marketingUrl('/privacy'),
    },
    capabilities: {
      offer_discovery: true,
      structured_comparison: true,
      checkout_handoff: true,
      negotiation: true,
      location_filtering: true,
    },
    offers: [
      {
        name: 'Nexez agent-ready storefront',
        description: 'Publish structured products and services that AI buyer agents can understand and act on.',
        price: 0,
        price_currency: 'USD',
        availability: 'available',
        action: {
          type: 'create_storefront',
          url: appUrl('/create'),
        },
      },
    ],
    endpoints: {
      search: agentRuntimeUrl('/api/agent-search?q={buyer_query}'),
      catalog: agentRuntimeUrl('/agent-pages.json'),
      llms: agentRuntimeUrl('/llms.txt'),
      openapi: agentRuntimeUrl('/openapi.json'),
      mcp: agentRuntimeUrl('/.well-known/mcp.json'),
    },
  }
}

/** The plans AggregateOffer, shared by the homepage graph and /pricing's own JSON-LD
 *  so the advertised price range is derived from the billing catalog in exactly one place. */
export function buildPlansAggregateOffer() {
  // Self-serve paid tiers only: Free is retired and Enterprise is custom-priced,
  // so the advertised price range is launch → scale (matches /pricing).
  const paidPlans = billingPlans.filter((plan) => plan.id !== 'free' && plan.id !== 'enterprise')
  const prices = paidPlans.map((plan) => planPriceNumber(plan.price))
  return {
    '@type': 'AggregateOffer',
    name: 'Nexez plans',
    description: 'Paid plans for agent-ready business storefronts, each starting with a 7-day free trial.',
    lowPrice: Math.min(...prices),
    highPrice: Math.max(...prices),
    priceCurrency: 'USD',
    offerCount: paidPlans.length,
    availability: 'https://schema.org/InStock',
    url: marketingUrl('/pricing'),
    potentialAction: {
      '@type': 'RegisterAction',
      name: 'Create an agent-ready storefront',
      target: appUrl('/create'),
    },
  }
}

/** Schema.org graph used by the marketing homepage and scanner self-checks. */
export function buildPlatformStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${marketingUrl('/')}#website`,
        name: 'Nexez',
        url: marketingUrl('/'),
        publisher: { '@id': `${marketingUrl('/')}#organization` },
        // /discovery?q= is the site's real search surface.
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: marketingUrl('/discovery?q={search_term_string}'),
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${marketingUrl('/')}#organization`,
        name: 'Nexez',
        url: marketingUrl('/'),
        description: 'Agent-commerce infrastructure for structured business offers, discovery, negotiation, and transactions.',
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          url: marketingUrl('/support'),
        },
        termsOfService: marketingUrl('/terms'),
        publishingPrinciples: marketingUrl('/privacy'),
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${marketingUrl('/')}#software`,
        name: 'Nexez',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: 'Publish agent-readable products and services with measurable buyer actions.',
        provider: { '@id': `${marketingUrl('/')}#organization` },
        dateModified: PLATFORM_CONTENT_DATE,
        offers: buildPlansAggregateOffer(),
      },
    ],
  }
}
