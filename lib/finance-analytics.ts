// Marketplace financial roll-ups for the Finance dashboard. Pure + client-safe
// (like lib/negotiation-metrics.ts) so they're unit-testable and can run in either
// a server page or a client island. GMV = the value of created Stripe checkout
// sessions (purchase intent at Stripe), excluding dry-run simulator events.
//
// HARD RULE: never sum amounts ACROSS currencies — amount_cents is the page's
// settlement-currency smallest unit (per lib/currency), so cross-currency sums are
// meaningless. Everything here buckets BY currency.
import type { CheckoutEvent } from './checkout-events'
import { getAmountCents, isDryRunEvent } from './analytics'
import { normalizeCurrency } from './currency'
import { calculateApplicationFeeCents } from './stripe-billing'

/** A created Stripe checkout session for a real (non-simulator) purchase. */
function isRevenueEvent(event: CheckoutEvent): boolean {
  return !isDryRunEvent(event) && event.event_type === 'stripe_session_created'
}

/** The settlement currency recorded on the event (default usd for pre-currency events). */
function eventCurrency(event: CheckoutEvent): string {
  return normalizeCurrency(event.metadata?.currency as string | undefined)
}

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type CurrencyFinanceRow = {
  currency: string
  gmvCents: number
  orders: number
  nexezFeeCents: number
  netCents: number
  aovCents: number
}

/**
 * Per-currency financial roll-up: GMV, order count, Nexez commission (derived
 * from the current plan rate), net-to-seller, and AOV. Sorted by GMV desc.
 * NOTE: the commission is DERIVED (gmv × current rate), not the historical
 * application_fee charged at the time of sale (which isn't stored on events).
 */
export function rollupFinanceByCurrency(events: CheckoutEvent[], commissionPct: number): CurrencyFinanceRow[] {
  const map = new Map<string, { gmvCents: number; orders: number }>()
  for (const event of events) {
    if (!isRevenueEvent(event)) continue
    const code = eventCurrency(event)
    const row = map.get(code) ?? { gmvCents: 0, orders: 0 }
    row.gmvCents += getAmountCents(event)
    row.orders += 1
    map.set(code, row)
  }
  return [...map.entries()]
    .map(([currency, { gmvCents, orders }]) => {
      const nexezFeeCents = calculateApplicationFeeCents(gmvCents, commissionPct)
      return {
        currency,
        gmvCents,
        orders,
        nexezFeeCents,
        netCents: gmvCents - nexezFeeCents,
        aovCents: orders ? Math.round(gmvCents / orders) : 0,
      }
    })
    .sort((a, b) => b.gmvCents - a.gmvCents)
}

export type DailyRevenuePoint = { label: string; dateKey: string; revenueCents: number; orders: number }

/** Per-day GMV series for the trend chart; optionally scoped to one currency. */
export function getDailyRevenueSeries(events: CheckoutEvent[], days = 30, currency?: string): DailyRevenuePoint[] {
  const now = new Date()
  const points: DailyRevenuePoint[] = []
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(now.getDate() - index)
    points.push({
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateKey: dateKey(date),
      revenueCents: 0,
      orders: 0,
    })
  }
  const byKey = new Map(points.map((point) => [point.dateKey, point]))
  const want = currency ? normalizeCurrency(currency) : null
  for (const event of events) {
    if (!isRevenueEvent(event)) continue
    if (want && eventCurrency(event) !== want) continue
    const point = byKey.get(dateKey(new Date(event.created_at)))
    if (point) {
      point.revenueCents += getAmountCents(event)
      point.orders += 1
    }
  }
  return points
}

export type OfferRevenue = { name: string; pageSlug: string; offerKey: string; revenueCents: number; orders: number }

/** Top offers ranked by GMV (not event count); optionally scoped to one currency. */
export function getTopOffersByRevenueCents(events: CheckoutEvent[], currency?: string): OfferRevenue[] {
  const map = new Map<string, OfferRevenue>()
  const want = currency ? normalizeCurrency(currency) : null
  for (const event of events) {
    if (!isRevenueEvent(event) || event.offer_key === 'page') continue
    if (want && eventCurrency(event) !== want) continue
    const key = `${event.slug}:${event.offer_key}`
    const row =
      map.get(key) ??
      ({ name: event.offer_name || event.offer_key, pageSlug: event.slug, offerKey: event.offer_key, revenueCents: 0, orders: 0 } satisfies OfferRevenue)
    row.revenueCents += getAmountCents(event)
    row.orders += 1
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents)
}

/** Distinct settlement currencies seen in revenue events, dominant (by GMV) first. */
export function getCurrencyOptions(events: CheckoutEvent[]): string[] {
  const gmv = new Map<string, number>()
  for (const event of events) {
    if (!isRevenueEvent(event)) continue
    const code = eventCurrency(event)
    gmv.set(code, (gmv.get(code) ?? 0) + getAmountCents(event))
  }
  return [...gmv.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
}
