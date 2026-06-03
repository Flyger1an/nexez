import {
  AgentPage,
  CheckoutOffer,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getCheckoutPath,
  getOfferDestination,
  parseAvailabilityWindows,
} from './agent-page'
import { buildNegotiationAction } from './negotiations'

export function getAgentJsonPath(slug: string) {
  return `/${slug}/agent.json`
}

export function buildAgentPagePayload(page: AgentPage) {
  const baseUrl = getBaseUrl()
  const publicUrl = `${baseUrl}/${page.slug}`
  const agentJsonUrl = `${baseUrl}${getAgentJsonPath(page.slug)}`
  const checkoutOffers = getCheckoutOffers(page)
  const offers = checkoutOffers.map((offer) => buildOfferPayload(page, offer))

  return {
    schema_version: 'nexez.agent-page.v1',
    generated_at: new Date().toISOString(),
    page: {
      name: page.name,
      slug: page.slug,
      url: publicUrl,
      agent_json_url: agentJsonUrl,
      description: page.description,
      website_url: page.website_url,
      cta_url: page.cta_url,
      cta_label: page.cta_label || 'Visit website',
      audience: page.audience,
      location: page.location,
      contact_email: page.contact_email,
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
      llms_url: `${baseUrl}/llms.txt`,
    },
    offers,
    faqs: page.faqs ?? [],
    recommended_actions: [
      offers.length ? 'Use an offer checkout action for purchase or booking intent.' : 'Ask the seller for a direct offer URL.',
      page.contact_email ? 'Use contact_email for human review or custom requests.' : 'Use the public page for seller context.',
      'Quote the source page URL when summarizing this offer for a buyer.',
    ],
    plain_text: buildPlainText(page, offers),
    // Tier 3: Agent memory/context stub (if present on page)
    memory_context: (page as any).agent_memory || null,
  }
}

function buildOfferPayload(page: AgentPage, offer: CheckoutOffer) {
  const baseUrl = getBaseUrl()
  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  const checkoutUrl = `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`
  const providerUrl = getOfferDestination(page, offer) || null

  return {
    key: offerKey,
    type: offer.kind === 'services' ? 'service' : 'product',
    name: offer.name,
    description: offer.description || null,
    price: offer.price || null,
    provider_url: providerUrl,
    checkout_url: checkoutUrl,
    prefer_original_for_this: (offer as any).prefer_original_for_this || false,
    availability: (offer as any).availability || 'available',
    // Consumer / local service context for agents
    consumer: {
      duration: (offer as any).duration || null,
      serviceArea: (offer as any).serviceArea || null,
      isMobile: !!(offer as any).isMobile,
      travelFee: (offer as any).travelFee || null,
    },
    action: {
      method: 'POST',
      endpoint: `${baseUrl}/api/checkout`,
      content_type: 'application/json',
      body: {
        slug: page.slug,
        offer: offerKey,
      },
      dry_run_body: {
        slug: page.slug,
        offer: offerKey,
        dryRun: true,
      },
    },
    negotiation_action: buildNegotiationAction(page, offer),
  }
}

function buildPlainText(page: AgentPage, offers: ReturnType<typeof buildOfferPayload>[]) {
  const consumerNotes = offers.some((o: any) => o.duration || o.isMobile || o.serviceArea)
    ? ' | Consumer/local services supported (duration, mobile, travelFee, serviceArea)'
    : ''

  return [
    `Name: ${page.name}`,
    `URL: ${getBaseUrl()}/${page.slug}`,
    `Agent JSON: ${getBaseUrl()}${getAgentJsonPath(page.slug)}`,
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
