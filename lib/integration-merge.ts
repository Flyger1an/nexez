import { smartMergeOffers } from './editor-merge'
import type { OfferItem } from './agent-page'

/**
 * Merge freshly-imported provider offers into a page's existing offers WITHOUT
 * ever clobbering the seller's manually-authored (or other-provider) offers.
 *
 * The invariant that matters (an adversarial review caught the naive version
 * silently overwriting a same-named paid offer's price/URL): only offers already
 * sourced from THIS provider are smart-merged; every other offer is preserved
 * verbatim. A same-named manual offer stays intact and the provider offer is
 * added as a separate entry. Incoming offers are tagged `source: provider` so a
 * later sync recognises them as managed, and each offer's metadata (e.g.
 * calendly_event_type) is reconciled onto the matched offer since smartMergeOffers
 * drops metadata on a name-collision merge.
 *
 * Pure — no I/O — so it's unit-tested independently of the sync route.
 */
export function mergeProviderOffers(existing: OfferItem[], incoming: OfferItem[], provider: string): OfferItem[] {
  const tagged = incoming.map((o) => ({ ...o, source: provider }))
  const managed = existing.filter((o) => o.source === provider)
  const untouched = existing.filter((o) => o.source !== provider)
  const merged = smartMergeOffers(managed, tagged, 'all')
  for (const inc of tagged) {
    if (!inc.metadata) continue
    const match = merged.find((o) => o.name.toLowerCase() === inc.name.toLowerCase())
    if (match) match.metadata = { ...(match.metadata ?? {}), ...inc.metadata }
  }
  return [...untouched, ...merged]
}

/**
 * Column-aware version: a listing splits offers across `services` and `products`,
 * and the rest of the platform (Calendly webhook/cron, Stripe webhook) treats a
 * provider offer as valid in EITHER column. So a sync must update a provider
 * offer wherever it already lives and must NOT add a duplicate to the other
 * column. Incoming offers that already exist as this provider's offers in
 * `products` are merged there; everything else flows to `services` (updated in
 * place if present, appended if new). Non-provider offers in both columns are
 * preserved.
 */
export function mergeProviderOffersAcrossColumns(
  services: OfferItem[],
  products: OfferItem[],
  incoming: OfferItem[],
  provider: string,
): { services: OfferItem[]; products: OfferItem[] } {
  const prodProviderNames = new Set(products.filter((o) => o.source === provider).map((o) => o.name.toLowerCase()))
  const toProducts = incoming.filter((o) => prodProviderNames.has(o.name.toLowerCase()))
  const toServices = incoming.filter((o) => !prodProviderNames.has(o.name.toLowerCase()))
  return {
    services: mergeProviderOffers(services, toServices, provider),
    products: mergeProviderOffers(products, toProducts, provider),
  }
}
