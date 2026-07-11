// Provider-neutral checkout-session core.
//
// This is the single foundation the agentic-commerce protocol adapters (OpenAI's
// Agentic Commerce Protocol, Google's Universal Commerce Protocol) BOTH adapt
// over. Every one of those protocols exposes the same merchant-hosted shape - a
// checkout session that is created, updated, then completed against a delegated
// payment credential - so the money-bearing logic must live in ONE place and be
// mapped into each protocol's wire format by a thin adapter. Forking a second
// pricing/settlement core per protocol is the failure mode this module exists to
// prevent.
//
// PURITY: this module is deterministic and side-effect-free. It resolves offers,
// prices line items, computes totals, and drives the session state machine - no
// Stripe, no database, no network, no commission/pause logic. That makes it
// unit-testable in isolation and safe to import anywhere. The Stripe-specific
// settlement (real charge, application fee, Connect account) is expressed here
// ONLY as a type signature (`SettleCheckoutSession`); the implementation lives in
// the settlement bridge (SF2), which is the one place allowed to import Stripe.
//
// CHARGE PARITY: per-line `unitAmount` is computed with the exact same expression
// the live direct-checkout route uses -
//   toStripeAmount(parseMoney(offer.price) ?? 0, normalizeCurrency(page.currency))
// - so a session settles for the identical amount a direct booking would. The page
// currency is the settlement source of truth; the offer price string is just the
// amount (a "£50" string on a USD page charges $50, never a silent mismatch).
//
// SCOPE (v1): digital + service offers only. No physical shipping, no tax
// resolution - `tax` is always 0 and `total === subtotal`. The field is kept in the
// shape so a later tax/shipping slice is additive, not a breaking change.

import {
  AgentPage,
  OfferKind,
  getCheckoutOffer,
  getCheckoutOfferKey,
} from '../agent-page'
import { normalizeCurrency, toStripeAmount } from '../currency'
import { parseMoney } from '../checkout'

/** The minimal page projection the session resolver reads. */
export type SessionPage = Pick<AgentPage, 'slug' | 'name' | 'currency' | 'products' | 'services'>

/** Buyer identity an agent may declare. Optional; does not gate readiness in v1
 * (parity with the direct-checkout route, which accepts anonymous purchases). An
 * adapter that requires contact info enforces that in its own layer. */
export type SessionBuyer = {
  email?: string | null
  name?: string | null
  reference?: string | null
  agent?: string | null
}

/** A line item as requested by an agent/cart. `offer` is either a structured key
 * ("services-0") or an offer name the resolver can match (same resolution the
 * direct-checkout route uses). */
export type RequestedLineItem = {
  offer: string
  quantity?: number
}

/** A fully resolved, priced line item. Amounts are in the currency's smallest unit
 * (Stripe convention): ×100 for normal currencies, as-is for zero-decimal ones. */
export type SessionLineItem = {
  /** Stable within a session - equal to the offer key. */
  id: string
  offerKey: string
  kind: OfferKind
  index: number
  name: string
  description: string
  quantity: number
  unitAmount: number
  subtotal: number
  currency: string
  offerType: 'fixed' | 'negotiable'
  availability: 'available' | 'limited' | 'sold_out'
}

/** Why a requested item could not be added to a payable session. */
export type SessionLineItemIssue = {
  /** The requested `offer` string, echoed back so the agent knows which entry failed. */
  offer: string
  code: 'not_found' | 'negotiable' | 'sold_out' | 'unpriced' | 'invalid_quantity'
  message: string
}

export type SessionTotals = {
  currency: string
  subtotal: number
  /** Always 0 in v1 (digital/service scope, no tax resolution). */
  tax: number
  total: number
}

/** Provider-neutral session lifecycle. Adapters map these onto each protocol's own
 * status vocabulary (e.g. ACP `not_ready_for_payment`/`ready_for_payment`). */
export type SessionStatus = 'pending' | 'ready' | 'completed' | 'canceled'

export type CheckoutSession = {
  id: string
  status: SessionStatus
  currency: string
  lineItems: SessionLineItem[]
  issues: SessionLineItemIssue[]
  totals: SessionTotals
  buyer: SessionBuyer | null
  /** Source identity carried for settlement + metadata (the pure core never reads
   * the owner/plan/Connect state - that is the settlement bridge's job). */
  source: {
    slug: string
    pageName: string
  }
}

/** Largest quantity a single line may request - a defensive cap against overflow /
 * abuse, well above any realistic digital/service order. */
export const MAX_LINE_QUANTITY = 1000

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

type ResolvedRequest = {
  offerKey: string
  kind: OfferKind
  index: number
  name: string
  description: string
  unitAmount: number
  offerType: 'fixed' | 'negotiable'
  availability: 'available' | 'limited' | 'sold_out'
  quantity: number
}

/** Resolve one requested item to either a priced tuple or an issue. Mirrors the
 * direct-checkout route's offer resolution + amount computation exactly. */
function resolveRequest(
  page: SessionPage,
  currency: string,
  requested: RequestedLineItem,
): { ok: true; value: ResolvedRequest } | { ok: false; issue: SessionLineItemIssue } {
  const label = requested.offer
  const offer = getCheckoutOffer(page, requested.offer)
  if (!offer) {
    return { ok: false, issue: { offer: label, code: 'not_found', message: 'No matching offer was found for this page.' } }
  }

  const quantity = requested.quantity == null ? 1 : requested.quantity
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return {
      ok: false,
      issue: { offer: label, code: 'invalid_quantity', message: `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.` },
    }
  }

  const offerType = offer.offerType ?? 'fixed'
  if (offerType === 'negotiable') {
    return {
      ok: false,
      issue: { offer: label, code: 'negotiable', message: 'This offer is negotiable and cannot be purchased directly - start a negotiation instead.' },
    }
  }

  const availability = offer.availability ?? 'available'
  if (availability === 'sold_out') {
    return { ok: false, issue: { offer: label, code: 'sold_out', message: 'This offer is sold out.' } }
  }

  // Byte-for-byte identical to the live checkout route's amount computation.
  const unitAmount = toStripeAmount(parseMoney(offer.price) ?? 0, currency)
  if (unitAmount <= 0) {
    return {
      ok: false,
      issue: { offer: label, code: 'unpriced', message: 'This offer has no fixed price and cannot be checked out directly.' },
    }
  }

  return {
    ok: true,
    value: {
      offerKey: getCheckoutOfferKey(offer.kind, offer.index),
      kind: offer.kind,
      index: offer.index,
      name: offer.name,
      description: offer.description ?? '',
      unitAmount,
      offerType: 'fixed',
      availability,
      quantity,
    },
  }
}

/** Resolve the full cart: price every requested item, merge duplicates by offer
 * key (summing quantity), and collect per-item issues. Deterministic. */
function resolveLineItems(
  page: SessionPage,
  currency: string,
  items: RequestedLineItem[],
): { lineItems: SessionLineItem[]; issues: SessionLineItemIssue[] } {
  const issues: SessionLineItemIssue[] = []
  // Preserve first-seen order while merging duplicate offer keys.
  const order: string[] = []
  const merged = new Map<string, ResolvedRequest>()

  for (const requested of items) {
    const result = resolveRequest(page, currency, requested)
    if (!result.ok) {
      issues.push(result.issue)
      continue
    }
    const value = result.value
    const existing = merged.get(value.offerKey)
    if (existing) {
      // Same offer requested twice - fold into one line, capping the summed
      // quantity so a merge can't exceed the per-line ceiling.
      existing.quantity = Math.min(existing.quantity + value.quantity, MAX_LINE_QUANTITY)
    } else {
      merged.set(value.offerKey, { ...value })
      order.push(value.offerKey)
    }
  }

  const lineItems: SessionLineItem[] = order.map((key) => {
    const r = merged.get(key)!
    return {
      id: r.offerKey,
      offerKey: r.offerKey,
      kind: r.kind,
      index: r.index,
      name: r.name,
      description: r.description,
      quantity: r.quantity,
      unitAmount: r.unitAmount,
      subtotal: r.unitAmount * r.quantity,
      currency,
      offerType: r.offerType,
      availability: r.availability,
    }
  })

  return { lineItems, issues }
}

function computeTotals(currency: string, lineItems: SessionLineItem[]): SessionTotals {
  const subtotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0)
  const tax = 0 // v1: digital/service scope, no tax resolution.
  return { currency, subtotal, tax, total: subtotal + tax }
}

/** A session is payable only when it has at least one resolved line item, no
 * outstanding issues, and a positive total. Everything else stays `pending`. */
function computeStatus(lineItems: SessionLineItem[], issues: SessionLineItemIssue[], totals: SessionTotals): SessionStatus {
  if (issues.length > 0) return 'pending'
  if (lineItems.length === 0) return 'pending'
  if (totals.total <= 0) return 'pending'
  return 'ready'
}

function normalizeBuyer(buyer: SessionBuyer | null | undefined): SessionBuyer | null {
  if (!buyer) return null
  const clean = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const email = clean(buyer.email)
  const name = clean(buyer.name)
  const reference = clean(buyer.reference)
  const agent = clean(buyer.agent)
  if (!email && !name && !reference && !agent) return null
  return { email, name, reference, agent }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/** Create a fresh checkout session from a page + requested cart. Pure: pass a
 * caller-generated `id` (the persistence layer owns id/randomness, not the core).
 * The returned session is `ready` when payable, else `pending` with `issues`. */
export function createSession(input: {
  id: string
  page: SessionPage
  items: RequestedLineItem[]
  buyer?: SessionBuyer | null
}): CheckoutSession {
  const currency = normalizeCurrency(input.page.currency)
  const { lineItems, issues } = resolveLineItems(input.page, currency, input.items ?? [])
  const totals = computeTotals(currency, lineItems)
  return {
    id: input.id,
    status: computeStatus(lineItems, issues, totals),
    currency,
    lineItems,
    issues,
    totals,
    buyer: normalizeBuyer(input.buyer),
    source: { slug: input.page.slug, pageName: input.page.name },
  }
}

/** Apply an update: optionally replace the cart and/or set the buyer, then
 * re-resolve and recompute. Only valid on a live (`pending`/`ready`) session -
 * a completed or canceled session is terminal and throws. When `items` is
 * omitted the existing line items are re-priced against the (possibly changed)
 * page, so a re-supplied page can flip an issue to `ready` or vice versa. */
export function updateSession(
  session: CheckoutSession,
  patch: { page: SessionPage; items?: RequestedLineItem[]; buyer?: SessionBuyer | null },
): CheckoutSession {
  if (session.status === 'completed' || session.status === 'canceled') {
    throw new Error(`Cannot update a ${session.status} checkout session.`)
  }
  const currency = normalizeCurrency(patch.page.currency)
  const requested: RequestedLineItem[] =
    patch.items ?? session.lineItems.map((li) => ({ offer: li.offerKey, quantity: li.quantity }))
  const { lineItems, issues } = resolveLineItems(patch.page, currency, requested)
  const totals = computeTotals(currency, lineItems)
  const buyer = patch.buyer === undefined ? session.buyer : normalizeBuyer(patch.buyer)
  return {
    ...session,
    status: computeStatus(lineItems, issues, totals),
    currency,
    lineItems,
    issues,
    totals,
    buyer,
    source: { slug: patch.page.slug, pageName: patch.page.name },
  }
}

/** Cancel a session. Idempotent when already canceled; throws when already
 * completed (a settled order is terminal and must be refunded, not canceled). */
export function cancelSession(session: CheckoutSession): CheckoutSession {
  if (session.status === 'canceled') return session
  if (session.status === 'completed') {
    throw new Error('Cannot cancel a completed checkout session.')
  }
  return { ...session, status: 'canceled' }
}

/** Mark a session settled. Only a `ready` session may complete - the settlement
 * bridge calls this AFTER a successful charge. Guards against completing a
 * session with outstanding issues / zero total (which are never `ready`). */
export function markSessionCompleted(session: CheckoutSession): CheckoutSession {
  if (session.status !== 'ready') {
    throw new Error(`Cannot complete a ${session.status} checkout session - it is not ready for payment.`)
  }
  return { ...session, status: 'completed' }
}

/** Whether a session is currently payable. The settlement bridge must gate on
 * this before charging. */
export function isSessionPayable(session: CheckoutSession): boolean {
  return session.status === 'ready'
}

// ---------------------------------------------------------------------------
// Settlement bridge - TYPE SIGNATURE ONLY (implemented in SF2)
// ---------------------------------------------------------------------------

/** A delegated payment credential handed over by a protocol. The `kind`
 * distinguishes ACP's Shared Payment Token (`vt_...`), UCP's Google Pay token,
 * and a raw Stripe PaymentMethod id (used to prove the settlement path end-to-end
 * against a Stripe test method before the real delegated-token swap). */
export type DelegatedPayment = {
  token: string
  kind: 'payment_method' | 'shared_payment_token' | 'google_pay'
}

/** Everything the settlement layer needs beyond the resolved session. These are
 * resolved from the database by the bridge (owner plan → commission percent,
 * Connect account, pause state) - deliberately NOT the pure core's concern, so a
 * protocol adapter never re-derives money/eligibility logic. */
export type SettlementContext = {
  pageId: string
  ownerId: string | null
  /** The seller's Stripe Connect account the charge settles into (owner is
   * merchant of record). Required - a session with no Connect account is not
   * settleable and the bridge returns `no_connect`. */
  connectAccountId: string
  /** Plan commission percent (0-100). The bridge computes the platform
   * application fee from this + the session total via the shared fee helper. */
  commissionPercent: number
}

export type SettlementResult =
  | {
      ok: true
      paymentIntentId: string
      orderId?: string
      /** Charged amount + platform fee, in the currency's smallest unit. */
      amount: number
      applicationFee: number
      currency: string
    }
  | {
      ok: false
      code: 'not_ready' | 'no_connect' | 'paused' | 'zero_amount' | 'stripe_error'
      message: string
    }

/** Provider-neutral settlement bridge. Takes a READY session + a delegated payment
 * credential + the DB-resolved context, and turns it into a real charge (owner's
 * Connect account, platform application fee) exactly like the direct-checkout
 * route. Implemented in SF2 (the only module allowed to import Stripe). ACP/UCP
 * adapters call THIS - never Stripe directly - so there is one money core. */
export type SettleCheckoutSession = (
  session: CheckoutSession,
  payment: DelegatedPayment,
  context: SettlementContext,
) => Promise<SettlementResult>
