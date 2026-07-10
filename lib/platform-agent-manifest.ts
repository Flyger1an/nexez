import { agentRuntimeUrl, appUrl, marketingUrl } from './site'

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

/** Schema.org graph used by the marketing homepage and scanner self-checks. */
export function buildPlatformStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
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
        dateModified: new Date().toISOString(),
        offers: {
          '@type': 'Offer',
          name: 'Nexez Free',
          description: 'Create and publish an agent-ready business storefront.',
          price: 0,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: marketingUrl('/pricing'),
          potentialAction: {
            '@type': 'RegisterAction',
            name: 'Create an agent-ready storefront',
            target: appUrl('/create'),
          },
        },
      },
    ],
  }
}
