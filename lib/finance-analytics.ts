// Marketplace financial roll-ups for the Finance dashboard. Pure + client-safe
// (like lib/negotiation-metrics.ts) so they're unit-testable and can run in either
// a server page or a client island. GMV = the value of created Stripe checkout
// sessions (purchase intent at Stripe), excluding dry-run simulator events.
//
// HARD RULE: never sum amounts ACROSS currencies — amount_cents is the page's
// settlement-currency smallest unit (per lib/currency), so cross-currency sums are
// meaningless. Everything here buckets BY currency.
import type { CheckoutEvent } from './checkout-events'
import { getAgentName, getAmountCents, isDryRunEvent } from './analytics'
import { normalizeCurrency, minorToStripeAmount } from './currency'
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
 *
 * SECURITY / AUDIT NOTE (red-team finding):
 * Commission was historically **derived from the owner's *current* plan** at read time.
 * Snapshots (commission_percent + application_fee_cents) are now persisted at charge
 * time (migration 20260627000000 + wiring in checkout/pay/webhook).
 * Rollups/ledgers prefer snapshot when present for historical accuracy. Fallback to
 * current plan derivation for legacy rows.
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

// ── Negotiated / escrow channel ─────────────────────────────────────────────
// The second revenue rail (agent_negotiations). Distinct from direct checkout:
// these are AGREED escrow amounts with a real settlement lifecycle, NOT checkout
// intent — never sum the two channels into one number, and never across currencies.

/** The widened agent_negotiations row the finance page selects (status + money + provenance). */
export type NegotiationFinanceRow = {
  id?: string | null
  status: string
  amount_cents: number | null
  currency: string | null
  slug?: string | null
  offer_name?: string | null
  buyer_agent?: string | null
  created_at?: string | null
}

export type NegotiationCurrencyRow = {
  currency: string
  agreedCents: number
  deals: number
  heldCents: number
  completeCents: number
  reversedCents: number
}

// A deal counts as "agreed" once it reaches/passes agreement. Reversals
// (refunded/disputed) are surfaced separately as money OUT, not in agreed/deals.
const AGREED_STATUSES = new Set(['agreement_proposed', 'held', 'complete'])

/**
 * Per-currency roll-up of the negotiated/escrow channel: agreed value + deal
 * count, currently-held escrow, captured (complete), and reversed
 * (refunded + disputed). Mirrors rollupFinanceByCurrency's per-currency shape so
 * one component renders both channels. NEVER sums across currencies.
 */
export function rollupNegotiationsByCurrency(negs: NegotiationFinanceRow[]): NegotiationCurrencyRow[] {
  const map = new Map<string, NegotiationCurrencyRow>()
  for (const n of negs) {
    if (!n.amount_cents) continue
    const currency = normalizeCurrency(n.currency)
    const row =
      map.get(currency) ??
      { currency, agreedCents: 0, deals: 0, heldCents: 0, completeCents: 0, reversedCents: 0 }
    // negotiation amount_cents is stored major×100; convert to the Stripe smallest unit
    // the rest of finance (formatCurrencyAmount) displays, so zero-decimal (JPY/KRW)
    // deals aren't shown 100× too large.
    const cents = minorToStripeAmount(n.amount_cents, currency)
    if (AGREED_STATUSES.has(n.status)) {
      row.agreedCents += cents
      row.deals += 1
    }
    if (n.status === 'held') row.heldCents += cents
    else if (n.status === 'complete') row.completeCents += cents
    else if (n.status === 'refunded' || n.status === 'disputed') row.reversedCents += cents
    map.set(currency, row)
  }
  return [...map.values()].sort((a, b) => b.agreedCents - a.agreedCents)
}

/**
 * Share of captured escrow value that was later reversed (refunded/disputed) — a
 * marketplace trust signal. Returns null when there's no settled volume to judge
 * (mirrors pctDelta's "no signal → null" so the UI shows "—" not a fake 0%).
 */
export function getReversalRate(row: { completeCents: number; reversedCents: number }): number | null {
  const denom = row.completeCents + row.reversedCents
  if (denom <= 0) return null
  return row.reversedCents / denom
}

// ── Unified marketplace ledger ──────────────────────────────────────────────

export type LedgerEntry = {
  id: string
  channel: 'direct' | 'negotiated'
  timestamp: string
  offerName: string
  pageSlug: string
  buyerLabel: string
  amountCents: number
  currency: string
  feeCents: number
  netCents: number
  status: string | null // negotiation status (negotiated rows only)
  isReversal: boolean
}

// Negotiation statuses that represent a real money event worth a ledger row.
const LEDGER_NEG_STATUSES = new Set(['held', 'complete', 'refunded', 'disputed'])

/**
 * Interleave the DIRECT checkout channel (checkout_events) and the NEGOTIATED
 * escrow channel (agent_negotiations) into one time-ordered ledger — the living
 * record of marketplace activity. Fee prefers charge-time snapshot if present on the
 * row (post 20260627 migration), else derives from passed current plan rate.
 * Each row carries its own currency;
 * callers must never total the amount/fee/net columns (mixed currencies coexist
 * as independent rows). Skips dry-run + amount-less rows.
 */
export function buildMarketplaceLedger(
  events: CheckoutEvent[],
  negs: NegotiationFinanceRow[],
  commissionPct: number,
  limit = 25,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  for (const event of events) {
    if (!isRevenueEvent(event)) continue
    const amountCents = getAmountCents(event)
    const feeCents = calculateApplicationFeeCents(amountCents, commissionPct)
    entries.push({
      id: event.id,
      channel: 'direct',
      timestamp: event.created_at,
      offerName: event.offer_name || event.offer_key,
      pageSlug: event.slug,
      buyerLabel: getAgentName(event.agent_user_agent),
      amountCents,
      currency: eventCurrency(event),
      feeCents,
      netCents: amountCents - feeCents,
      status: null,
      isReversal: false,
    })
  }
  for (const n of negs) {
    if (!n.amount_cents || !LEDGER_NEG_STATUSES.has(n.status)) continue
    // Convert the app's major×100 amount to the Stripe smallest unit so it lines up
    // with the (already smallest-unit) application_fee_cents snapshot + the display
    // formatter; otherwise zero-decimal currencies mis-state amount/fee/net.
    const amountCents = minorToStripeAmount(n.amount_cents, normalizeCurrency(n.currency))
    const isReversal = n.status === 'refunded' || n.status === 'disputed'
    // A refund/dispute returns the full amount to the buyer (escrow refunds aren't
    // fee-reduced), so the seller's outflow is the whole amount — fee n/a.
    // Prefer snapshot at charge time if present (from migration 20260627000000).
    const snapshotFee = (n as any).application_fee_cents
    const feeCents = isReversal ? 0 : (typeof snapshotFee === 'number' && snapshotFee != null ? snapshotFee : calculateApplicationFeeCents(amountCents, commissionPct))
    entries.push({
      id: n.id ? `neg-${n.id}` : `neg-${n.slug ?? ''}-${n.created_at ?? ''}`,
      channel: 'negotiated',
      timestamp: n.created_at ?? '',
      offerName: n.offer_name || 'Negotiated deal',
      pageSlug: n.slug ?? '',
      buyerLabel: (n.buyer_agent || 'Agent').slice(0, 72),
      amountCents,
      currency: normalizeCurrency(n.currency),
      feeCents,
      netCents: isReversal ? amountCents : amountCents - feeCents,
      status: n.status,
      isReversal,
    })
  }
  return entries
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
    .slice(0, limit)
}
