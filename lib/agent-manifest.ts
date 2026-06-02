import {
  AgentPage,
  CheckoutOffer,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getCheckoutPath,
  getOfferDestination,
} from './agent-page'

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
        note: (page as any).next_available 
          ? null 
          : 'Contact for current availability. Recent booking activity may indicate current slots.',
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
  }
}

function buildPlainText(page: AgentPage, offers: ReturnType<typeof buildOfferPayload>[]) {
  return [
    `Name: ${page.name}`,
    `URL: ${getBaseUrl()}/${page.slug}`,
    `Agent JSON: ${getBaseUrl()}${getAgentJsonPath(page.slug)}`,
    `Summary: ${page.description ?? ''}`,
    `Best-fit buyer: ${page.audience ?? ''}`,
    `Location: ${page.location ?? ''}`,
    `Availability: ${(page as any).next_available ?? 'Contact for current availability'}`,
    `Website: ${page.website_url ?? ''}`,
    `Primary action: ${page.cta_label ?? 'Visit website'} -> ${page.cta_url || page.website_url || ''}`,
    `Offers: ${offers.map((offer) => `${offer.name} (${offer.type}) ${offer.checkout_url}`).join('; ') || 'None listed'}`,
  ].join('\n')
}
