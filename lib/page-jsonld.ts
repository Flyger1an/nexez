import { AgentPage, getBaseUrl, getCheckoutPath, schemaAvailability } from './agent-page'
import { normalizeDomainPath } from './custom-domain'
import { normalizeCurrency } from './currency'
import { priceValidUntil } from './freshness'
import type { ReviewSummary } from './reviews'

/**
 * schema.org JSON-LD for a listing (WebPage → Organization → makesOffer[Offer]).
 * Extracted verbatim from app/[slug]/page.tsx so the public page AND the
 * Agent-Ready Kit (the copy-paste block merchants embed on their OWN site)
 * emit the exact same structured data. Pure — safe to snapshot-test.
 */
export function buildJsonLd(
  page: AgentPage,
  baseUrl: string = getBaseUrl(),
  domainPath: string = '/',
  hidden?: { services: Set<number>; products: Set<number> },
  reviewSummary?: ReviewSummary,
) {
  const dp = normalizeDomainPath(domainPath)
  const url = dp === '/' && !baseUrl.includes('/nexez') ? baseUrl : `${baseUrl.replace(/\/$/, '')}${dp}/${page.slug}`.replace(/\/+/g,'/').replace(/\/$/,'')
  const pagePrefer = !!page.prefer_original_site
  // Freshness-anchored price validity so agents don't treat the price as permanent.
  const validUntil = priceValidUntil(page) || undefined
  const offers = [
    ...(page.services ?? []).map((item, index) => ({ item, kind: 'services' as const, index })),
    ...(page.products ?? []).map((item, index) => ({ item, kind: 'products' as const, index })),
  ].filter(({ kind, index }) => !hidden?.[kind]?.has(index)).map(({ item, kind, index }) => {
    const perOfferPrefer = !!item.prefer_original_for_this
    const useOriginal = perOfferPrefer || (pagePrefer && !!item.url)
    const effectiveUrl = useOriginal && item.url ? item.url : `${baseUrl}${getCheckoutPath(page.slug, kind, index)}`
    return {
      '@type': 'Offer',
      name: item.name,
      description: item.description || undefined,
      price: item.price || undefined,
      // schema.org Offer.price is ambiguous without priceCurrency - surface the page
      // settlement currency (matches the checkout page's JSON-LD).
      priceCurrency: item.price ? normalizeCurrency((page as { currency?: string | null }).currency).toUpperCase() : undefined,
      priceValidUntil: item.price ? validUntil : undefined,
      availability: schemaAvailability(item.availability),
      url: effectiveUrl,
      potentialAction: {
        '@type': 'BuyAction',
        target: effectiveUrl,
      },
      itemOffered: {
        '@type': 'Service',
        name: item.name,
        description: item.description || undefined,
      },
    }
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.name,
    url,
    description: page.description,
    mainEntity: {
      '@type': 'Organization',
      name: page.name,
      url: page.website_url || url,
      areaServed: page.location || undefined,
      email: page.contact_email || undefined,
      aggregateRating: reviewSummary?.count && reviewSummary.average != null
        ? {
            '@type': 'AggregateRating',
            ratingValue: reviewSummary.average,
            reviewCount: reviewSummary.count,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
      review: reviewSummary?.recent_reviews?.filter((review) => review.title || review.body).slice(0, 3).map((review) => ({
        '@type': 'Review',
        name: review.title || undefined,
        reviewBody: review.body || undefined,
        reviewRating: {
          '@type': 'Rating',
          ratingValue: review.rating,
          bestRating: 5,
          worstRating: 1,
        },
      })),
      makesOffer: offers,
    },
  }
}
