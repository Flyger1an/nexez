import {
  AgentPage,
  CheckoutOffer,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getCheckoutPath,
  getCertification,
  getOfferDestination,
  parseAvailabilityWindows,
  resolvePreferredContact,
} from './agent-page'
import { buildNegotiationAction } from './negotiations'
import { publicBookingConstraints } from './offer-rules'
import { rewriteForVoiceSync } from './ai-optimize'
import { normalizeCurrency } from './currency'
import { agentArtifactHref, normalizeDomainPath } from './custom-domain'

export function getAgentJsonPath(slug: string) {
  return `/${slug}/agent.json`
}

export function buildAgentPagePayload(
  page: AgentPage,
  baseUrl = getBaseUrl(),
  opts: { negotiationAllowed?: boolean } = {},
) {
  // negotiationAllowed gates the per-offer negotiation_action so the machine
  // manifest matches the public render + the gated POST /api/negotiations. Pure
  // builder shared by bulk endpoints, so the caller threads the resolved plan
  // entitlement explicitly (default false = omit, never a DB read in here).
  const negotiationAllowed = opts.negotiationAllowed === true
  const dp = normalizeDomainPath((page as any).domain_path)
  const platformBase = getBaseUrl()
  // identityBase for page self, agent.json, llms.txt, etc. (custom root + domain_path when applicable)
  const identityBase = baseUrl
  const publicUrl = dp === '/' ? identityBase : `${identityBase.replace(/\/$/, '')}${dp}/${page.slug}`.replace(/\/+/g, '/').replace(/\/$/, '')
  const agentJsonUrl = `${identityBase}${agentArtifactHref('agent.json', page.slug, dp !== '/' || !identityBase.includes('nexez'), dp)}`
  const llmsUrl = `${identityBase}${agentArtifactHref('llms.txt' as any, page.slug, dp !== '/' || !identityBase.includes('nexez'), dp)}`
  const checkoutOffers = getCheckoutOffers(page)
  const offers = checkoutOffers.map((offer) => buildOfferPayload(page, offer, identityBase, platformBase, negotiationAllowed))

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
      availability: {
        next_available: (page as any).next_available || null,
        last_booking: page.last_booking || null,
        source: (page as any).google_calendar_id ? 'google_calendar' : (page as any).next_available ? 'manual' : null,
        calendar_id: (page as any).google_calendar_id || null,
        note: (page as any).next_available 
          ? 'Availability imported or set manually. Agents can use this for scheduling.'
          : 'Contact for current availability. Recent booking activity may indicate current slots.',
        // Phase 3: Structured windows from Google Calendar stub import (or future real sync).
        // Agents get a machine-readable list of upcoming slots in addition to the human note.
        windows: parseAvailabilityWindows((page as any).next_available),
      },
      llms_url: llmsUrl,
    },
    offers,
    faqs: page.faqs ?? [],
    recommended_actions: [
      offers.length ? 'Use an offer checkout action for purchase or booking intent.' : 'Ask the seller for a direct offer URL.',
      page.contact_email ? 'Use contact_email for human review or custom requests.' : 'Use the public page for seller context.',
      'Quote the source page URL when summarizing this offer for a buyer.',
    ],
    plain_text: buildPlainText(page, offers, identityBase),
    // Agent memory/context (if present on page)
    memory_context: (page as any).agent_memory || null,
    // "Nexez Certified Agent-Ready" trust signal (published + 95%+ readiness).
    certification: getCertification(page),
  }
}

function buildOfferPayload(page: AgentPage, offer: CheckoutOffer, identityBase: string, platformBase: string, negotiationAllowed = false) {
  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  // Only advertise negotiation when the owner's plan allows it AND this offer is
  // negotiable — otherwise an agent would POST /api/negotiations and get a 403.
  const isNegotiable = (offer as { offerType?: string }).offerType === 'negotiable'
  const checkoutUrl = `${identityBase}${getCheckoutPath(page.slug, offer.kind, offer.index)}`
  const providerUrl = getOfferDestination(page, offer) || null

  return {
    key: offerKey,
    type: offer.kind === 'services' ? 'service' : 'product',
    name: offer.name,
    description: offer.description || null,
    // Speech-ready phrasing for voice agents (advanced LLM-powered using platform's configured LLM when page llm_opt_in + key, else deterministic).
    voice_summary: offer.description ? rewriteForVoiceSync(offer, page.name).description : null,
    price: offer.price || null,
    // Currency for `price` (the page settlement currency) — explicit per-offer so an
    // agent reading a single offer never has to assume USD.
    currency: normalizeCurrency((page as { currency?: string | null }).currency),
    provider_url: providerUrl,
    checkout_url: checkoutUrl,
    prefer_original_for_this: (offer as any).prefer_original_for_this || false,
    availability: (offer as any).availability || 'available',
    // Smart Rules Phase 1: hybrid booking. Public-safe constraints ONLY —
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
        buyerEmail: 'Buyer email — prefills checkout and enables the receipt + order portal.',
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

function buildPlainText(page: AgentPage, offers: ReturnType<typeof buildOfferPayload>[], identityBase: string) {
  const consumerNotes = offers.some((o: any) => o.duration || o.isMobile || o.serviceArea)
    ? ' | Consumer/local services supported (duration, mobile, travelFee, serviceArea)'
    : ''
  const dp = normalizeDomainPath((page as any).domain_path)
  const pageUrl = dp === '/' ? identityBase : `${identityBase.replace(/\/$/, '')}${dp}/${page.slug}`.replace(/\/+/g, '/').replace(/\/$/, '')
  const agentJson = `${identityBase}${agentArtifactHref('agent.json', page.slug, dp !== '/' || !identityBase.includes('nexez'), dp)}`

  return [
    `Name: ${page.name}`,
    `URL: ${pageUrl}`,
    `Agent JSON: ${agentJson}`,
    `Summary: ${page.description ?? ''}`,
    `Best-fit buyer: ${page.audience ?? ''}`,
    `Location: ${page.location ?? ''}`,
    `Availability: ${(page as any).next_available ?? 'Contact for current availability'}${ (page as any).google_calendar_id ? ' (Google Calendar synced)' : '' }`,
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
