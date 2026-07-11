// Shared offer-feed projection (SF4).
//
// Both agentic-commerce protocols publish a product feed: OpenAI's ACP wants a
// product feed of purchasable items, Google's UCP wants a Merchant Center feed.
// They differ only in wire format, not in content - so the projection from a Nexez
// page's offers to normalized feed rows lives HERE, once, and each protocol adapter
// renders these rows into its own format. No forked feed logic per protocol.
//
// PURITY: deterministic and side-effect-free. `baseUrl` is passed in (never read
// from env or a request header) so the caller owns host resolution + the
// x-forwarded-host hardening; the projection just uses it to build absolute links.
//
// v1 scope (matches the settlement core): only directly-purchasable, fixed-price
// offers appear in the feed. Negotiable offers (no fixed price) and unpriced
// ("Contact us") offers are excluded - a product feed advertises things an agent can
// buy now. A priced-but-sold-out offer IS included, flagged `out_of_stock`, so an
// agent can see it exists without dead-ending on a purchase.

import {
  AgentPage,
  OfferKind,
  getCheckoutOffers,
  getCheckoutOfferKey,
  getCheckoutPath,
} from '../agent-page'
import {
  normalizeCurrency,
  toStripeAmount,
  toMajorAmount,
  isZeroDecimalCurrency,
  formatCurrencyAmount,
} from '../currency'
import { parseMoney } from '../checkout'

/** The minimal page projection the feed needs. */
export type FeedPage = Pick<AgentPage, 'slug' | 'name' | 'currency' | 'products' | 'services'>

/** A normalized feed row - the common shape ACP + UCP both render from. */
export type OfferFeedRow = {
  /** Globally-unique, stable feed id (`${slug}:${offerKey}`) - safe across a
   * multi-listing storefront feed where offer keys collide between listings. */
  id: string
  slug: string
  offerKey: string
  kind: OfferKind
  sellerName: string
  title: string
  description: string
  /** Product landing page (human-facing). */
  link: string
  /** Agent checkout endpoint for this specific offer. */
  checkoutUrl: string
  availability: 'in_stock' | 'out_of_stock'
  /** Charge amount in the currency's smallest unit (ACP base_amount / Stripe unit). */
  priceAmountMinor: number
  /** ISO 4217, lowercase (Nexez convention). */
  priceCurrency: string
  /** Human display, locale-formatted (e.g. "$1,200"). */
  priceDisplay: string
  /** Google Merchant Center price format: major units + uppercase code (e.g. "1200.00 USD"). */
  priceFeed: string
}

function stripTrailingSlash(base: string): string {
  return base.replace(/\/+$/, '')
}

/** Google Merchant Center price string: major-unit amount with the currency's decimal
 * places + the uppercase ISO code. Zero-decimal currencies (JPY) carry no decimals. */
function toMerchantFeedPrice(amountMinor: number, currency: string): string {
  const major = toMajorAmount(amountMinor, currency)
  const decimals = isZeroDecimalCurrency(currency) ? 0 : 2
  return `${major.toFixed(decimals)} ${currency.toUpperCase()}`
}

/** Project a page's offers into normalized feed rows. Fixed, priced offers only;
 * sold-out priced offers are included as `out_of_stock`. Deterministic. */
export function buildOfferFeedRows(page: FeedPage, baseUrl: string): OfferFeedRow[] {
  const base = stripTrailingSlash(baseUrl)
  const currency = normalizeCurrency(page.currency)
  const rows: OfferFeedRow[] = []

  for (const offer of getCheckoutOffers(page)) {
    // A product feed advertises what an agent can buy: skip negotiable (no fixed
    // price → routed to negotiation, not checkout).
    if ((offer.offerType ?? 'fixed') === 'negotiable') continue

    // Amount identical to the settlement core + live checkout route.
    const priceAmountMinor = toStripeAmount(parseMoney(offer.price) ?? 0, currency)
    if (priceAmountMinor <= 0) continue // unpriced → not purchasable via a feed

    const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
    rows.push({
      id: `${page.slug}:${offerKey}`,
      slug: page.slug,
      offerKey,
      kind: offer.kind,
      sellerName: page.name,
      title: offer.name,
      description: offer.description ?? '',
      link: `${base}/${page.slug}`,
      checkoutUrl: `${base}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
      availability: (offer.availability ?? 'available') === 'sold_out' ? 'out_of_stock' : 'in_stock',
      priceAmountMinor,
      priceCurrency: currency,
      priceDisplay: formatCurrencyAmount(priceAmountMinor, currency),
      priceFeed: toMerchantFeedPrice(priceAmountMinor, currency),
    })
  }

  return rows
}
