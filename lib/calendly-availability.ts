// Bi-directional Calendly sync - the inbound half (Calendly -> Nexez), pure.
// The webhook receives every real booking/cancellation; these helpers turn
// that stream into the offer's advertised `availability` so agents see
// sold_out/limited BEFORE attempting a checkout the weekly cap would refuse.
// The outbound half already exists: offers link the Calendly scheduling URL
// and checkout enforces rules.maxBookingsPerWeek at booking time.
import type { OfferItem } from './agent-page'

export type OfferAvailability = NonNullable<OfferItem['availability']>

/**
 * Build the `pages.next_available` string from derived open-slot windows: a
 * human note for the listing + the machine-readable `||WINDOWS||<json>` tail that
 * parseAvailabilityWindows reads back. Shared by the availability cron and the
 * manual "Sync from Calendly" endpoint so both write the identical format.
 */
export function buildCalendlyNextAvailable(windows: Array<{ label: string }>, days: number): string {
  const note = windows.length
    ? `Next open slots: ${windows.slice(0, 3).map((w) => w.label).join(', ')} (synced from Calendly)`
    : `No open slots in the next ${days} days (synced from Calendly)`
  return `${note} ||WINDOWS||${JSON.stringify(windows)}`
}

/**
 * Derive advertised availability from the rolling-week booking count vs the
 * owner's cap. Deterministic and recomputed from scratch on every event, so
 * created/canceled webhooks and the cron sweep all self-correct.
 * - no remaining slots -> sold_out
 * - final third of capacity (caps > 1) -> limited
 */
export function computeAvailability(cap: number, booked: number): OfferAvailability {
  const remaining = cap - booked
  if (remaining <= 0) return 'sold_out'
  if (cap > 1 && remaining * 3 <= cap) return 'limited'
  return 'available'
}

const matchName = (value: string | null | undefined) => (value || '').trim().toLowerCase()

export type OfferMatch = { kind: 'services' | 'products'; index: number; offer: OfferItem }

/**
 * Find the offer a Calendly event belongs to. The Calendly importer copies the
 * event-type name verbatim into the offer name, so trimmed case-insensitive
 * name equality is the join key (the webhook payload carries no scheduling
 * URL to match on). Renaming the offer deliberately detaches it from sync.
 */
export function findOfferByEventName(
  page: { services?: OfferItem[] | null; products?: OfferItem[] | null },
  eventName: string | null | undefined,
): OfferMatch | null {
  const wanted = matchName(eventName)
  if (!wanted) return null
  for (const kind of ['services', 'products'] as const) {
    const offers = page[kind] || []
    for (let index = 0; index < offers.length; index++) {
      if (matchName(offers[index]!.name) === wanted) return { kind, index, offer: offers[index]! }
    }
  }
  return null
}

/**
 * The owner's opt-in to automated availability: a positive weekly booking cap
 * (the same rule the checkout gate enforces). No cap -> availability stays
 * whatever the owner set by hand; sync never touches it.
 */
export function offerBookingCap(offer: Pick<OfferItem, 'rules'>): number | null {
  const cap = offer.rules?.maxBookingsPerWeek
  return cap != null && cap > 0 ? cap : null
}

/**
 * Set one offer's availability, immutably. Unset availability counts as
 * 'available', so an under-cap offer that was never touched stays unwritten
 * (no churn on every booking). Changed offers are stamped with
 * metadata.last_calendly_sync - the marker the cron sweep uses to know an
 * offer is sync-managed (vs. manually set availability it must not touch).
 */
export function applyOfferAvailability(
  offers: OfferItem[],
  index: number,
  availability: OfferAvailability,
  syncedAt?: string,
): { offers: OfferItem[]; changed: boolean } {
  const current = offers[index]
  if (!current || (current.availability ?? 'available') === availability) return { offers, changed: false }
  const next = offers.slice()
  next[index] = {
    ...current,
    availability,
    metadata: syncedAt ? { ...(current.metadata || {}), last_calendly_sync: syncedAt } : current.metadata,
  }
  return { offers: next, changed: true }
}
