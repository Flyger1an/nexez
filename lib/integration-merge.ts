import { smartMergeOffers } from './editor-merge'
import type { OfferItem } from './agent-page'

export type ProviderMergeOptions = {
  /** Provider sub-tenant, currently the normalized Shopify shop domain. */
  scope?: string
  /** Remove provider-managed records absent from a complete upstream catalog. */
  pruneMissing?: boolean
}

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isManagedOffer(offer: OfferItem, provider: string, scope?: string): boolean {
  if (offer.source !== provider) return false
  if (provider !== 'shopify' || !scope) return true
  const offerShop = normalized(offer.metadata?.shopify_shop)
  // Legacy token imports predate shop-scoped metadata. Adopt them into the
  // currently linked shop on the next sync; an explicitly different shop is
  // never touched.
  return !offerShop || offerShop === normalized(scope)
}

function providerIdentity(offer: OfferItem, provider: string): string {
  if (provider === 'shopify') {
    const id = normalized(offer.metadata?.shopify_product_id)
    if (id) return `shopify:${id}`
  }
  if (provider === 'calendly') {
    const id = normalized(offer.metadata?.calendly_event_type)
    if (id) return `calendly:${id}`
  }
  return `name:${normalized(offer.name)}`
}

function mergeManagedOffer(current: OfferItem, incoming: OfferItem, provider: string): OfferItem {
  if (provider !== 'shopify') {
    const merged = smartMergeOffers([current], [incoming], 'all')[0] ?? incoming
    return { ...merged, metadata: { ...(current.metadata ?? {}), ...(incoming.metadata ?? {}) } }
  }

  // Shopify remains authoritative for commerce fields (title, price, URL,
  // variants and inventory). Preserve substantial owner copy and private rules.
  return {
    ...current,
    ...incoming,
    description: (current.description?.length || 0) > 80 ? current.description : incoming.description || current.description,
    metadata: { ...(current.metadata ?? {}), ...(incoming.metadata ?? {}) },
    offerType: current.offerType ?? incoming.offerType,
    rules: current.rules ?? incoming.rules,
  }
}

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
export function mergeProviderOffers(
  existing: OfferItem[],
  incoming: OfferItem[],
  provider: string,
  options: ProviderMergeOptions = {},
): OfferItem[] {
  const tagged = incoming.map((o) => ({ ...o, source: provider }))
  const remaining = new Map(tagged.map((offer) => [providerIdentity(offer, provider), offer]))
  const result: OfferItem[] = []

  for (const current of existing) {
    if (!isManagedOffer(current, provider, options.scope)) {
      result.push(current)
      continue
    }
    const key = providerIdentity(current, provider)
    const fresh = remaining.get(key)
    if (fresh) {
      result.push(mergeManagedOffer(current, fresh, provider))
      remaining.delete(key)
    } else if (!options.pruneMissing) {
      result.push(current)
    }
  }

  result.push(...remaining.values())
  return result
}

/**
 * Column-aware version: a listing splits offers across `services` and `products`,
 * and the rest of the platform (Calendly webhook/cron, Stripe webhook) treats a
 * provider offer as valid in EITHER column. So a sync must update a provider
 * offer wherever it already lives and must NOT add a duplicate to the other
 * column. Incoming offers that already exist as this provider's offers in
 * `products` are merged there. New Shopify catalog items default to `products`;
 * service-oriented providers default to `services`. Existing provider offers
 * stay in their current column so a re-sync never changes stable offer keys.
 * Non-provider offers in both columns are preserved.
 */
export function mergeProviderOffersAcrossColumns(
  services: OfferItem[],
  products: OfferItem[],
  incoming: OfferItem[],
  provider: string,
  options: ProviderMergeOptions = {},
): { services: OfferItem[]; products: OfferItem[] } {
  const productProviderKeys = new Set(products.filter((o) => isManagedOffer(o, provider, options.scope)).map((o) => providerIdentity(o, provider)))
  const serviceProviderKeys = new Set(services.filter((o) => isManagedOffer(o, provider, options.scope)).map((o) => providerIdentity(o, provider)))
  const defaultToProducts = provider === 'shopify'
  const toProducts = incoming.filter((o) => {
    const key = providerIdentity(o, provider)
    return productProviderKeys.has(key) || (!serviceProviderKeys.has(key) && defaultToProducts)
  })
  const toServices = incoming.filter((o) => {
    const key = providerIdentity(o, provider)
    return serviceProviderKeys.has(key) || (!productProviderKeys.has(key) && !defaultToProducts)
  })
  return {
    services: mergeProviderOffers(services, toServices, provider, options),
    products: mergeProviderOffers(products, toProducts, provider, options),
  }
}
