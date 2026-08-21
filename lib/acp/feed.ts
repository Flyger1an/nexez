// ACP product feed (A1) - the flat file OpenAI ingests + indexes for Instant
// Checkout discovery. A THIN projection over the shared SF4 feed core
// (buildOfferFeedRows): the offer walk, pricing (minor units), currency, and
// availability all come from there; this only re-labels into ACP field names and
// adds the ACP-specific eligibility + seller/country fields.
//
// Pure + deterministic (the route stamps generated_at + supplies baseUrl/opts).
//
// v1 scope: is_eligible_search is always true (offers are discoverable); is_eligible_
// checkout is gated on `checkoutEnabled` (owner-blocked until OpenAI partner
// enrollment + Stripe SPT), so pre-enrollment every item is search-eligible but not
// checkout-eligible - honest, not aspirational.

import { AgentPage, sanitizePublicUrl } from '../agent-page'
import { buildOfferFeedRows, type FeedPage } from '../commerce/offer-feed'

/** The page projection the ACP feed needs: SF4's FeedPage + the seller's site URL. */
export type AcpFeedPage = FeedPage & Pick<AgentPage, 'website_url'>

export type AcpFeedItem = {
  item_id: string
  title: string
  description: string
  /** Product landing page (HTTP 200). */
  url: string
  /** Minor units + ISO-4217 (uppercase), matching the ACP checkout API's amounts. */
  price: { amount: number; currency: string }
  /** Human-readable price (convenience; not part of the strict schema). */
  price_display: string
  availability: 'in_stock' | 'out_of_stock'
  is_eligible_search: boolean
  is_eligible_checkout: boolean
  seller_name: string
  seller_url: string
  /** ISO 3166-1 alpha-2. */
  store_country: string
  target_countries: string[]
}

export type AcpFeedOptions = {
  /** The PROGRAM-level gate: false (default, pre-enrollment) → every item is
   * search-eligible but NOT checkout-eligible, regardless of the seller. */
  checkoutEnabled?: boolean
  /** The PER-SELLER gate: the set of slugs whose owner has a charge-ready Stripe
   * Connect account. When provided, only these slugs can be
   * checkout-eligible; when omitted, no per-seller gate is applied (the route always
   * supplies a set — fail-closed — whenever `checkoutEnabled` is true). */
  checkoutEligibleSlugs?: Set<string>
  /** ISO 3166-1 alpha-2. Scoping kept from the ACP checkout era; the ChatGPT
   * checkout surface was retired in March 2026 and the feed is discovery-only. */
  storeCountry?: string
  targetCountries?: string[]
}

/** Project visible pages into ACP feed items (one per purchasable offer). */
export function buildAcpFeedItems(pages: AcpFeedPage[], baseUrl: string, opts: AcpFeedOptions = {}): AcpFeedItem[] {
  const base = baseUrl.replace(/\/+$/, '')
  const storeCountry = (opts.storeCountry || 'US').toUpperCase()
  const targetCountries = (opts.targetCountries?.length ? opts.targetCountries : ['US']).map((c) => c.toUpperCase())
  const checkoutEnabled = Boolean(opts.checkoutEnabled)
  const eligibleSlugs = opts.checkoutEligibleSlugs

  const items: AcpFeedItem[] = []
  for (const page of pages) {
    const sellerUrl = sanitizePublicUrl(page.website_url) || `${base}/${page.slug}`
    // Per-seller gate: when a set is supplied, the seller must be settlement-ready.
    const sellerEligible = eligibleSlugs ? eligibleSlugs.has(page.slug) : true
    for (const row of buildOfferFeedRows(page, baseUrl)) {
      const inStock = row.availability === 'in_stock'
      items.push({
        item_id: row.id,
        title: row.title,
        description: row.description || row.title,
        url: row.link,
        price: { amount: row.priceAmountMinor, currency: row.priceCurrency.toUpperCase() },
        price_display: row.priceDisplay,
        availability: row.availability,
        // Discoverable now; checkout-eligible only once enrollment + SPT are live AND
        // the offer is in stock.
        is_eligible_search: true,
        is_eligible_checkout: checkoutEnabled && inStock && sellerEligible,
        seller_name: row.sellerName,
        seller_url: sellerUrl,
        store_country: storeCountry,
        target_countries: targetCountries,
      })
    }
  }
  return items
}
