import {
  AgentPage,
  CheckoutOffer,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getCheckoutPath,
  getAgentOfferType,
  getCertification,
  getOfferDestination,
  getPreferredOriginalOfferUrl,
  parseAvailabilityWindows,
  resolvePreferredContact,
} from './agent-page'
import { buildNegotiationAction } from './negotiations'
import { publicBookingConstraints } from './offer-rules'
import { rewriteForVoiceSync } from './ai-optimize'
import { normalizeCurrency } from './currency'
import { agentArtifactHref, normalizeDomainPath } from './custom-domain'
import type { ReviewSummary } from './reviews'

export function getAgentJsonPath(slug: string) {
  return `/${slug}/agent.json`
}

export type AgentStorefrontRef = {
  handle: string
  url: string
  agent_json_url: string
}

export function buildAgentStorefrontRef(handle: string, baseUrl = getBaseUrl()): AgentStorefrontRef {
  const clean = handle.trim().toLowerCase()
  return {
    handle: clean,
    url: absoluteRuntimeUrl(baseUrl, `/store/${clean}`),
    agent_json_url: absoluteRuntimeUrl(baseUrl, `/store/${clean}/agent.json`),
  }
}

export function buildAgentPagePayload(
  page: AgentPage,
  baseUrl = getBaseUrl(),
  opts: { negotiationAllowed?: boolean; storefront?: AgentStorefrontRef | null; reviewSummary?: ReviewSummary | null } = {},
) {
  // negotiationAllowed gates the per-offer negotiation_action so the machine
  // manifest matches the public render + the gated POST /api/negotiations. Pure
  // builder shared by bulk endpoints, so the caller threads the resolved plan
  // entitlement explicitly (default false = omit, never a DB read in here).
  const negotiationAllowed = opts.negotiationAllowed === true
  const dp = normalizeDomainPath((page as any).domain_path)
  const platformBase = getBaseUrl()
  // identityBase: the effective root for this page's identity (already adjusted by caller for custom+dp)
  const identityBase = baseUrl
  // For custom root: self URL = identityBase (e.g. https://acme.com)
  // For subpath: self URL = identityBase (caller includes dp) , e.g. https://acme.com/pricing
  // Never append slug to identity URLs on custom (slug is internal; domainPath maps it)
  const isCustomRootOrSub = dp !== '/' || !identityBase.includes('nexez.')
  const publicUrl = buildPublicPageUrl(page.slug, identityBase, isCustomRootOrSub)
  const agentJsonUrl = absoluteRuntimeUrl(identityBase, agentArtifactHref('agent.json', page.slug, isCustomRootOrSub, dp))
  const llmsUrl = absoluteRuntimeUrl(identityBase, agentArtifactHref('llms.txt', page.slug, isCustomRootOrSub, dp))
  const openApiUrl = absoluteRuntimeUrl(identityBase, agentArtifactHref('openapi.json', page.slug, isCustomRootOrSub, dp))
  const checkoutOffers = getCheckoutOffers(page)
  const offers = checkoutOffers.map((offer) => buildOfferPayload(page, offer, identityBase, platformBase, negotiationAllowed))
  const ratingSummary = publicRatingSummary(opts.reviewSummary)

  return {
    schema_version: 'nexez.agent-page.v1',
    generated_at: new Date().toISOString(),
    last_updated: (page as { updated_at?: string | null }).updated_at || (page as { created_at?: string | null }).created_at || null,
    page: {
      name: page.name,
      slug: page.slug,
      url: publicUrl,
      agent_json_url: agentJsonUrl,
      // Settlement currency for every offer price below (ISO 4217, lowercase) so an
      // agent can compare prices across pages without fetching each one.
      currency: normalizeCurrency((page as { currency?: string | null }).currency),
      description: page.description,
      website_url: page.website_url,
      cta_url: page.cta_url,
      cta_label: page.cta_label || 'Visit website',
      audience: page.audience,
      location: page.location,
      contact_email: page.contact_email,
      // Which channel to use first to reach a human (so an agent never has to guess
      // email vs the primary action vs the website). `value` is directly actionable;
      // `channels` lists every available channel, preferred first.
      contact: resolvePreferredContact(page),
      rating_summary: ratingSummary,
      availability: {
        next_available: (page as any).next_available || null,
        last_booking: page.last_booking || null,
        source: (page as any).next_available ? 'published_availability' : null,
        note: (page as any).next_available 
          ? 'Availability imported or set manually. Agents can use this for scheduling.'
          : 'Contact for current availability. Recent booking activity may indicate current slots.',
        // Phase 3: Structured windows from Google Calendar stub import (or future real sync).
        // Agents get a machine-readable list of upcoming slots in addition to the human note.
        windows: parseAvailabilityWindows((page as any).next_available),
      },
      llms_url: llmsUrl,
      // Per-page OpenAPI spec (domain-scoped): slug + offer keys pinned to this page.
      openapi_url: openApiUrl,
    },
    offers,
    faqs: page.faqs ?? [],
    recommended_actions: [
      offers.length ? 'Use an offer checkout action for purchase or booking intent.' : 'Ask the seller for a direct offer URL.',
      page.contact_email ? 'Use contact_email for human review or custom requests.' : 'Use the public page for seller context.',
      'Quote the source page URL when summarizing this offer for a buyer.',
    ],
    plain_text: buildPlainText(page, offers, identityBase, opts.storefront, opts.reviewSummary),
    ...(opts.storefront ? { storefront: opts.storefront } : {}),
    // Agent memory/context (if present on page)
    memory_context: (page as any).agent_memory || null,
    // Live technical certification. Trust verification and marketplace curation
    // remain separate signals.
    certification: getCertification(page),
  }
}

function publicRatingSummary(summary?: ReviewSummary | null) {
  if (!summary?.count || summary.average == null) return null
  return {
    average: summary.average,
    count: summary.count,
    verified_count: summary.verified_count,
    reputation_score: summary.reputation_score,
    distribution: summary.distribution,
    recent_positive_tags: summary.recent_positive_tags,
    recent_reviews: summary.recent_reviews,
  }
}

function buildOfferPayload(page: AgentPage, offer: CheckoutOffer, identityBase: string, platformBase: string, negotiationAllowed = false) {
  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  // Only advertise negotiation when the owner's plan allows it AND this offer is
  // negotiable - otherwise an agent would POST /api/negotiations and get a 403.
  const isNegotiable = (offer as { offerType?: string }).offerType === 'negotiable'
  const preferredOriginalUrl = getPreferredOriginalOfferUrl(page, offer)
  const checkoutUrl = preferredOriginalUrl || absoluteRuntimeUrl(platformBase, getCheckoutPath(page.slug, offer.kind, offer.index))
  const providerUrl = getOfferDestination(page, offer) || null

  return {
    key: offerKey,
    type: getAgentOfferType(offer),
    name: offer.name,
    description: offer.description || null,
    // Speech-ready phrasing for voice agents (advanced LLM-powered using platform's configured LLM when page llm_opt_in + key, else deterministic).
    voice_summary: offer.description ? rewriteForVoiceSync(offer, page.name).description : null,
    price: offer.price || null,
    // Currency for `price` (the page settlement currency) - explicit per-offer so an
    // agent reading a single offer never has to assume USD.
    currency: normalizeCurrency((page as { currency?: string | null }).currency),
    provider_url: providerUrl,
    checkout_url: checkoutUrl,
    prefer_original_for_this: (offer as any).prefer_original_for_this || false,
    availability: (offer as any).availability || 'available',
    // Smart Rules Phase 1: hybrid booking. Public-safe constraints ONLY -
    // pricing rules (min price, discount/auto-accept thresholds) never leave
    // the server. Negotiable offers: lead with negotiation_action below.
    ...publicBookingConstraints(offer),
    // Consumer / local service context for agents
    consumer: {
      duration: (offer as any).duration || null,
      serviceArea: (offer as any).serviceArea || null,
      isMobile: !!(offer as any).isMobile,
      travelFee: (offer as any).travelFee || null,
    },
    action: {
      method: 'POST',
      endpoint: `${platformBase}/api/checkout`,
      content_type: 'application/json',
      body: {
        slug: page.slug,
        offer: offerKey,
      },
      // Optional buyer identity an agent can include so the seller knows who is buying
      // and the buyer gets a receipt + order-portal access. All optional.
      optional_fields: {
        buyerEmail: 'Buyer email - prefills checkout and enables the receipt + order portal.',
        buyerName: 'Buyer or business name.',
        buyerReference: 'Your buyer-side reference / order id (also stamped on the Stripe session).',
        buyerAgent: 'Identifier for the buying agent.',
      },
      dry_run_body: {
        slug: page.slug,
        offer: offerKey,
        dryRun: true,
      },
    },
    negotiation_action: negotiationAllowed && isNegotiable ? buildNegotiationAction(page, offer, platformBase) : undefined,
  }
}

function buildPlainText(
  page: AgentPage,
  offers: ReturnType<typeof buildOfferPayload>[],
  identityBase: string,
  storefront?: AgentStorefrontRef | null,
  reviewSummary?: ReviewSummary | null,
) {
  const consumerNotes = offers.some((o: any) => o.duration || o.isMobile || o.serviceArea)
    ? ' | Consumer/local services supported (duration, mobile, travelFee, serviceArea)'
    : ''
  const dp = normalizeDomainPath((page as any).domain_path)
  const isCustomRootOrSub = dp !== '/' || !identityBase.includes('nexez.')
  const pageUrl = buildPublicPageUrl(page.slug, identityBase, isCustomRootOrSub)
  const agentJson = absoluteRuntimeUrl(identityBase, agentArtifactHref('agent.json', page.slug, isCustomRootOrSub, dp))

  return [
    `Name: ${page.name}`,
    `URL: ${pageUrl}`,
    `Agent JSON: ${agentJson}`,
    ...(storefront ? [`Storefront: ${storefront.url}`, `Storefront JSON: ${storefront.agent_json_url}`] : []),
    `Summary: ${page.description ?? ''}`,
    ...(reviewSummary?.count && reviewSummary.average != null
      ? [`Verified rating: ${reviewSummary.average}/5 from ${reviewSummary.count} purchase review${reviewSummary.count === 1 ? '' : 's'}`]
      : []),
    `Best-fit buyer: ${page.audience ?? ''}`,
    `Location: ${page.location ?? ''}`,
    `Availability: ${(page as any).next_available ?? 'Contact for current availability'}`,
    ...(parseAvailabilityWindows((page as any).next_available)?.length
      ? [`Upcoming windows (for agents): ${parseAvailabilityWindows((page as any).next_available)!.slice(0,3).map((w:any)=>w.label||w.start).join(', ')}`]
      : []),
    `Website: ${page.website_url ?? ''}`,
    `Primary action: ${page.cta_label ?? 'Visit website'} -> ${page.cta_url || page.website_url || ''}`,
    `Offers: ${offers.map((offer: any) => {
      const pref = offer.prefer_original_for_this ? ' [prefers original site]' : ''
      return `${offer.name} (${offer.type})${pref} ${offer.checkout_url}`
    }).join('; ') || 'None listed'}${consumerNotes}`,
  ].join('\n')
}

function buildPublicPageUrl(slug: string, identityBase: string, isCustomRootOrSub: boolean) {
  return isCustomRootOrSub ? trimTrailingSlash(identityBase) : absoluteRuntimeUrl(identityBase, `/${slug}`)
}

function absoluteRuntimeUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return trimTrailingSlash(new URL(normalizedPath, ensureTrailingSlash(baseUrl)).toString())
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}
