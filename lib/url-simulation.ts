import type { ImportResult } from './importer'
import { getReadinessScore } from './agent-page'

/**
 * Shapes a deterministic site crawl (ImportResult) into the simulator's
 * "any URL" comparison: what an AI agent gets from the raw site **today**
 * versus what it would get if the same business were an agent-ready Nexez page.
 * Pure + deterministic so it runs in tests and on the server with no I/O.
 *
 * Honesty matters here - this is a public, outward-facing demo. The importer is
 * an *enrichment* tool: when it can't extract real offers it scaffolds a
 * template (tagged `source: 'template'`) so onboarding has a starting point.
 * For a "what's really on this site" view we DROP those scaffolds, so a thin
 * site (e.g. a one-page placeholder) honestly shows "no offers detected" rather
 * than fabricated priced offers. The agent-ready side is framed as a projection
 * of the page Nexez *would* generate, not a claim about what the site exposes.
 */

// Sources that are natively machine-readable on the raw site (an agent could read
// them without Nexez). Heuristic/Shopify/LLM-derived offers are scraped/inferred,
// not something the site itself hands an agent.
const NATIVE_AGENT_KINDS = new Set(['schema_org', 'agent_json', 'llms_txt'])
// Offers we will NOT present as "detected": pure scaffolds invented when the
// crawl found little, not extracted from the site's own content.
const FABRICATED_OFFER_SOURCES = new Set(['template', 'guidance'])

export type UrlSimOffer = { name: string; price: string | null; description: string | null }

export type UrlSimComparison = {
  url: string
  host: string
  agentReady: {
    name: string
    description: string | null
    audience: string | null
    location: string | null
    offers: UrlSimOffer[]
    offerCount: number
    pricedCount: number
    faqCount: number
    readiness: number
    pagesAnalyzed: number
    confidence: number
  }
  raw: {
    title: string | null
    nativeStructuredData: boolean
    nativeAgentDocs: boolean
    actionable: false
    summary: string
  }
  gains: string[]
  verdict: string
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function buildUrlSimComparison(url: string, r: ImportResult): UrlSimComparison {
  // Real extraction only - drop template/guidance scaffolds so we never show a
  // fabricated priced offer as if it were on the site.
  const realOffers = (r.structuredOffers ?? []).filter((o) => !FABRICATED_OFFER_SOURCES.has(o.source || ''))
  const detectedOffers = realOffers.length > 0
  const offers: UrlSimOffer[] = realOffers.map((o) => ({
    name: o.name,
    price: o.price || null,
    description: o.description || null,
  }))
  const pricedCount = offers.filter((o) => (o.price || '').trim()).length
  // FAQs/description/audience can also be enriched; only credit them toward the
  // projected readiness when the crawl actually found real offers (i.e. the site
  // had substance to extract). A placeholder page projects a low, honest score.
  const faqCount = detectedOffers ? (r.faqs?.length ?? 0) : 0
  const readiness = getReadinessScore({
    name: r.title || 'Preview',
    slug: 'preview',
    website_url: r.website_url || url,
    cta_url: detectedOffers ? r.cta_url || null : null,
    description: detectedOffers ? r.description || null : null,
    audience: detectedOffers ? r.audience || null : null,
    industry: detectedOffers ? r.industry || null : null,
    location: detectedOffers ? r.location || null : null,
    services: realOffers,
    products: null,
    faqs: faqCount ? r.faqs ?? null : null,
    is_published: true,
  })
  const sources = r.sources ?? []
  const nativeStructuredData = sources.some((s) => NATIVE_AGENT_KINDS.has(s.type))
  const nativeAgentDocs = sources.some((s) => s.type === 'agent_json' || s.type === 'llms_txt')
  const host = safeHost(url)

  const summary = nativeAgentDocs
    ? `${host} exposes some agent documents already, but they're scattered - no single structured offer list and no checkout an agent can call.`
    : nativeStructuredData
      ? `${host} has some schema.org markup an agent can read, but no unified priced offer list and no actions it can take.`
      : `An agent visiting ${host} sees unstructured HTML. To do anything it has to scrape and guess - no machine-readable offers, prices, or checkout actions.`

  const gains: string[] = []
  if (detectedOffers)
    gains.push(`${offers.length} offer${offers.length === 1 ? '' : 's'} structured into a machine-readable list${pricedCount ? ` (${pricedCount} priced)` : ''}`)
  gains.push('A callable checkout action for each offer (POST /api/checkout)')
  gains.push('One agent.json + llms.txt an agent reads in a single request')
  if (faqCount) gains.push(`${faqCount} FAQ${faqCount === 1 ? '' : 's'} agents can quote to clear objections`)

  const verdict = detectedOffers
    ? `Nexez would turn ${host} into a listing an AI agent can act on - ${offers.length} structured offer${offers.length === 1 ? '' : 's'} with a callable checkout and a projected ${readiness}% readiness, up from raw HTML an agent has to guess at.`
    : `We couldn't auto-detect structured offers on ${host} from its public pages - an agent-ready Nexez listing would add the offer list, prices, and actions an agent needs.`

  return {
    url,
    host,
    agentReady: {
      name: r.title,
      description: detectedOffers ? r.description || null : null,
      audience: detectedOffers ? r.audience || null : null,
      location: detectedOffers ? r.location || null : null,
      offers,
      offerCount: offers.length,
      pricedCount,
      faqCount,
      readiness,
      pagesAnalyzed: r.pagesAnalyzed ?? 0,
      confidence: r.confidence ?? 0,
    },
    raw: {
      title: r.title || null,
      nativeStructuredData,
      nativeAgentDocs,
      actionable: false,
      summary,
    },
    gains,
    verdict,
  }
}
