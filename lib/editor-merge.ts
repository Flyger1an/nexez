// Pure, framework-free helpers extracted from the page editor
// (app/dashboard/[id]/page.tsx). Keeping the smart-merge, save-payload, and
// draft logic here means it is unit-testable and lives in exactly one place
// instead of being inlined ~6 times across the editor's handlers.
import { OfferItem, normalizeSlug, parseOfferLines, parseFaqLines } from './agent-page'

/** The offer-bearing slice of editor state (raw text + rich arrays). */
export type EditorOffersInput = {
  name: string
  description: string
  industry: string
  preferOriginalSite: boolean
  services: string // legacy raw-text view
  products: string // legacy raw-text view
  faqs: string
  servicesOffers: OfferItem[]
  productsOffers: OfferItem[]
}

/** Full editor state needed to build a save payload. */
export type EditorSaveInput = EditorOffersInput & {
  slug: string
  websiteUrl: string
  ctaUrl: string
  ctaLabel: string
  audience: string
  location: string
  contactEmail: string
  nextAvailable: string
  isPublished: boolean
}

/**
 * Resolve the effective offer arrays: prefer the rich `*Offers` state, falling
 * back to parsing the legacy raw-text view. Mirrors the
 * `xOffers.length ? xOffers : parseOfferLines(x)` ternary used throughout the
 * original editor.
 */
function resolveOffers(input: EditorOffersInput): { services: OfferItem[]; products: OfferItem[] } {
  return {
    services: input.servicesOffers.length ? input.servicesOffers : parseOfferLines(input.services),
    products: input.productsOffers.length ? input.productsOffers : parseOfferLines(input.products),
  }
}

/**
 * Canonical smart merge of incoming offers into existing ones (by
 * case-insensitive name). Protects substantial manual work — long descriptions
 * (>80 chars) and existing pricing tiers — while taking fresh
 * price/url/duration/serviceArea/isMobile/travelFee. Stripe-sourced offers
 * always take the fresh price. `mode: 'new'` only appends genuinely new offers
 * and leaves existing ones untouched.
 *
 * This is a strict superset of the lighter inline merge the old
 * `handleSyncFromWebsite` used: for website-imported offers `source` and
 * `prefer_original_for_this` are undefined, so the `?? existing` branches are
 * inert and the result is identical.
 */
export function smartMergeOffers(
  existing: OfferItem[],
  incoming: OfferItem[],
  mode: 'all' | 'new' = 'all',
): OfferItem[] {
  const merged = [...existing]

  incoming.forEach((inc) => {
    const idx = merged.findIndex((m) => m.name.toLowerCase() === inc.name.toLowerCase())
    const isNew = idx === -1

    if (mode === 'new' && !isNew) return

    if (idx >= 0) {
      const current = merged[idx]
      const isStripe = inc.source === 'stripe'
      const newPrice = isStripe && inc.price ? inc.price : inc.price || current.price
      merged[idx] = {
        ...current,
        price: newPrice,
        url: inc.url || current.url,
        duration: inc.duration || current.duration,
        serviceArea: inc.serviceArea || current.serviceArea,
        isMobile: inc.isMobile ?? current.isMobile,
        travelFee: inc.travelFee || current.travelFee,
        description: (current.description?.length || 0) > 80 ? current.description : inc.description || current.description,
        tiers: current.tiers?.length ? current.tiers : inc.tiers || [],
        source: inc.source || current.source,
        prefer_original_for_this: inc.prefer_original_for_this ?? current.prefer_original_for_this,
        // Smart Rules are owner-authored — imports/re-syncs never overwrite them.
        offerType: current.offerType ?? inc.offerType,
        rules: current.rules ?? inc.rules,
      }
    } else {
      merged.push(inc)
    }
  })

  return merged
}

/** Count how many incoming offers are new vs. updates to existing ones. */
export function countOfferChanges(
  existing: OfferItem[],
  incoming: OfferItem[],
): { newCount: number; updateCount: number } {
  const newCount = incoming.filter(
    (inc) => !existing.some((e) => e.name.toLowerCase() === inc.name.toLowerCase()),
  ).length
  return { newCount, updateCount: incoming.length - newCount }
}

/** Detect Stripe-sourced price changes between current and incoming offers (for the preview diff). */
export function detectStripePriceChanges(
  existing: OfferItem[],
  incoming: OfferItem[],
): { name: string; old: string; new: string }[] {
  const currentStripe = existing.filter((o) => o.source === 'stripe')
  return incoming
    .filter((inc) => inc.source === 'stripe')
    .map((inc) => {
      const match = currentStripe.find((c) => c.name.toLowerCase() === inc.name.toLowerCase())
      if (match && match.price !== inc.price) {
        return { name: inc.name, old: match.price, new: inc.price }
      }
      return null
    })
    .filter((c): c is { name: string; old: string; new: string } => c !== null)
}

/** The draft snapshot persisted by "Save as draft" (staging, not live). */
export function buildDraftContent(input: EditorOffersInput) {
  const { services, products } = resolveOffers(input)
  return {
    name: input.name,
    description: input.description,
    services,
    products,
    faqs: parseFaqLines(input.faqs),
    industry: input.industry,
    prefer_original_site: input.preferOriginalSite,
  }
}

/** A single version-history snapshot (timestamped). */
export function buildVersionSnapshot(input: EditorOffersInput, now: string = new Date().toISOString()) {
  const { services, products } = resolveOffers(input)
  return {
    timestamp: now,
    name: input.name,
    description: input.description,
    services,
    products,
    faqs: parseFaqLines(input.faqs),
    industry: input.industry,
    prefer_original_site: input.preferOriginalSite,
  }
}

/**
 * Build the `pages` update payload for a live Save, plus the trimmed version
 * history (snapshot prepended, capped at the most recent 10). Mirrors the
 * original `handleSubmit` exactly. The team-approval branch stays in the hook
 * (it is conditional UI state, not pure).
 */
export function buildSavePayload(
  input: EditorSaveInput,
  existingVersions: any[] = [],
  now?: string,
) {
  const { services, products } = resolveOffers(input)
  const snapshot = buildVersionSnapshot(input, now)
  const versions = [snapshot, ...(existingVersions || [])].slice(0, 10)
  const payload = {
    name: input.name,
    slug: normalizeSlug(input.slug || input.name),
    description: input.description,
    website_url: input.websiteUrl,
    cta_url: input.ctaUrl || input.websiteUrl,
    cta_label: input.ctaLabel || 'Visit website',
    audience: input.audience,
    location: input.location,
    contact_email: input.contactEmail,
    industry: input.industry,
    prefer_original_site: input.preferOriginalSite,
    next_available: input.nextAvailable || null,
    products,
    services,
    faqs: parseFaqLines(input.faqs),
    is_published: input.isPublished,
    versions,
  }
  return { payload, versions, snapshot }
}
