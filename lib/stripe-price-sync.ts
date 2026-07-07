// Bi-directional Stripe sync — the inbound half (Stripe → Nexez), pure.
// Offers imported from Stripe carry stable identifiers in
// metadata.stripe_price_id / metadata.stripe_product_id (set by
// /api/integrations/stripe/import); when a `price.updated`/`price.created`
// webhook arrives, these helpers refresh every matching offer so listings
// track Stripe without a manual re-import. The outbound half already exists:
// checkout writes PaymentIntents onto the seller's connected account.
import type { OfferItem } from './agent-page'

export type StripePriceLike = {
  id: string
  unit_amount?: number | null
  recurring?: { interval?: string | null } | null
  active?: boolean
}

/** Format a Stripe price the exact way the importer does ("$40", "$40 / month",
 *  "Custom", "Custom / month") so a webhook sync is byte-identical to a manual
 *  re-import — truthiness on unit_amount (a $0 price reads Custom) and the
 *  interval appended unconditionally, both matching stripe/import/route.ts. */
export function formatStripePriceString(price: Pick<StripePriceLike, 'unit_amount' | 'recurring'>): string {
  const amount = price.unit_amount ? `$${(price.unit_amount / 100).toFixed(0)}` : 'Custom'
  const interval = price.recurring?.interval
  return interval ? `${amount} / ${interval}` : amount
}

export type PriceSyncTarget = {
  priceId: string
  /** The price's parent product — fallback match for product-keyed imports. */
  productId?: string | null
  /** Pre-formatted via formatStripePriceString. */
  priceStr: string
  /** ISO timestamp stamped onto changed offers' metadata.last_stripe_sync. */
  syncedAt?: string
}

export type PriceSyncResult = {
  offers: OfferItem[]
  /** Offers whose price actually changed (0 → nothing to write; idempotent). */
  changed: number
  /** What moved, for the audit trail. */
  changes: Array<{ name: string; from: string; to: string }>
}

/**
 * Apply a fresh Stripe price to every offer imported from Stripe.
 * - Match requires `source === 'stripe'` — an owner who clears the source has
 *   deliberately detached the offer, and it stops syncing.
 * - Primary key: metadata.stripe_price_id === priceId. Fallback: an offer with
 *   NO price id of its own matches on stripe_product_id (product-keyed
 *   imports). Requiring the absence fixes the multi-price clobber — a
 *   product's monthly offer must not be rewritten by its yearly price's event.
 * - Only the `price` field moves (the smart-merge philosophy: Stripe-sourced
 *   offers always take the fresh price; names/descriptions stay the owner's),
 *   plus the importer's auto-generated single "Standard" tier, which mirrors
 *   the offer price and moves in lockstep while it still matches.
 * - Already-current offers count as unchanged, making webhook retries no-ops.
 */
export function applyPriceToOffers(offers: OfferItem[], target: PriceSyncTarget): PriceSyncResult {
  const changes: PriceSyncResult['changes'] = []
  const next = offers.map((offer) => {
    if (offer.source !== 'stripe') return offer
    const meta = offer.metadata || {}
    const byPrice = meta.stripe_price_id === target.priceId
    const byProduct = !meta.stripe_price_id && target.productId && meta.stripe_product_id === target.productId
    if ((!byPrice && !byProduct) || offer.price === target.priceStr) return offer
    changes.push({ name: offer.name, from: offer.price || '', to: target.priceStr })
    const updated: OfferItem = {
      ...offer,
      price: target.priceStr,
      metadata: target.syncedAt ? { ...meta, last_stripe_sync: target.syncedAt } : offer.metadata,
    }
    if (
      offer.tiers &&
      offer.tiers.length === 1 &&
      offer.tiers[0].name === 'Standard' &&
      offer.tiers[0].price === offer.price
    ) {
      updated.tiers = [{ ...offer.tiers[0], price: target.priceStr }]
    }
    return updated
  })
  return { offers: next, changed: changes.length, changes }
}
