// UCP / Google Merchant Center product feed (U3) — the flat file Google ingests to
// index Nexez offers for UCP agentic checkout. A THIN projection over the shared SF4
// feed core (buildOfferFeedRows), re-labelled into Merchant-Center field names +
// UCP eligibility. Google Merchant wants the price as "MAJOR.dd CUR" (SF4's
// row.priceFeed already produces exactly that) and availability as in_stock/out_of_stock.
//
// Pure + deterministic. v1: is_eligible_search always true; is_eligible_checkout gated
// on `checkoutEnabled` (owner-blocked until Merchant Center + UCP waitlist enrollment).

import { AgentPage, sanitizePublicUrl } from '../agent-page'
import { buildOfferFeedRows, type FeedPage } from '../commerce/offer-feed'

export type UcpFeedPage = FeedPage & Pick<AgentPage, 'website_url'>

export type UcpFeedItem = {
  id: string
  title: string
  description: string
  link: string
  /** Google Merchant format: "MAJOR.dd CUR" (e.g. "1200.00 USD"). */
  price: string
  availability: 'in_stock' | 'out_of_stock'
  brand: string
  seller_url: string
  is_eligible_search: boolean
  is_eligible_checkout: boolean
}

export type UcpFeedOptions = { checkoutEnabled?: boolean }

/** Project visible pages into UCP/Merchant-Center feed items (one per purchasable
 * offer). Inherits SF4's filtering: fixed priced offers only, sold-out → out_of_stock. */
export function buildUcpFeedItems(pages: UcpFeedPage[], baseUrl: string, opts: UcpFeedOptions = {}): UcpFeedItem[] {
  const base = baseUrl.replace(/\/+$/, '')
  const checkoutEnabled = Boolean(opts.checkoutEnabled)
  const items: UcpFeedItem[] = []
  for (const page of pages) {
    const sellerUrl = sanitizePublicUrl(page.website_url) || `${base}/${page.slug}`
    for (const row of buildOfferFeedRows(page, baseUrl)) {
      const inStock = row.availability === 'in_stock'
      items.push({
        id: row.id,
        title: row.title,
        description: row.description || row.title,
        link: row.link,
        price: row.priceFeed,
        availability: row.availability,
        brand: row.sellerName,
        seller_url: sellerUrl,
        is_eligible_search: true,
        is_eligible_checkout: checkoutEnabled && inStock,
      })
    }
  }
  return items
}
