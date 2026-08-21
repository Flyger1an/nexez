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
import { parseBuyerIdentity, hasBuyerIdentity } from '../buyer-identity'
import { getOfferStagedSettlementTerms } from '../configured-offer'

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
  code: 'not_found' | 'negotiable' | 'sold_out' | 'unpriced' | 'invalid_quantity' | 'staged_settlement_not_supported'
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

/** The amount + cart a buyer authorized, frozen the moment the session first became
 * payable. Settlement re-prices against live offers, so this is the ONLY record of
 * what was actually agreed to; without it an upward price edit between quote and
 * complete would charge the new number under the old authorization. Immutable once
 * set, except when the agent deliberately supplies a new cart (see `updateSession`). */
export type SessionApproval = {
  /** Authorized total in the currency's smallest unit. */
  amount: number
  currency: string
  /** Identifies the cart's COMPOSITION (offers + quantities), deliberately not its
   * prices - price movement is judged by `amount` so a price DROP still settles. */
  cartFingerprint: string
}

export type CheckoutSession = {
  id: string
  status: SessionStatus
  currency: string
  lineItems: SessionLineItem[]
  issues: SessionLineItemIssue[]
  totals: SessionTotals
  buyer: SessionBuyer | null
  /** Frozen at the first `ready`; null while the session has never been payable. */
  approval: SessionApproval | null
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

  if (getOfferStagedSettlementTerms(offer)) {
    return {
      ok: false,
      issue: {
        offer: label,
        code: 'staged_settlement_not_supported',
        message: 'This offer uses staged settlement and cannot be charged as one protocol checkout line.',
      },
    }
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

/** Two 32-bit lanes over the same input, concatenated to 16 hex chars. Dependency-free
 * on purpose: this module is pure and importable anywhere, so it cannot reach for
 * node:crypto. This is an equality token, never a security boundary - the value is
 * produced and compared server-side only, and is never accepted from a caller. */
function hash64(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0xc2b2ae35
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** A stable identifier for what is IN the cart: offer keys and quantities, order-
 * independent. Excludes price by design - a merchant lowering their price must still
 * settle (the amount check allows it), and only a genuine composition change should
 * read as a different cart. Line count is prefixed so a hash collision also has to
 * match the cart size. */
export function cartFingerprint(lineItems: SessionLineItem[]): string {
  const canonical = lineItems
    .map((li) => `${li.offerKey}x${li.quantity}`)
    .sort()
    .join('|')
  return `${lineItems.length}-${hash64(canonical)}`
}

/** The approval to freeze for a session that has just become payable. */
function approvalFrom(totals: SessionTotals, lineItems: SessionLineItem[]): SessionApproval {
  return {
    amount: totals.total,
    currency: totals.currency,
    cartFingerprint: cartFingerprint(lineItems),
  }
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
  // Full parity with the direct-checkout path (parseBuyerIdentity): strip control
  // chars, length-cap every field, and validate + lowercase the email. This keeps a
  // value that Stripe would reject on its 500-char metadata limit - or that would
  // corrupt the order-portal "find my orders" lookup - from ever entering a session.
  const parsed = parseBuyerIdentity({
    buyerEmail: buyer.email,
    buyerName: buyer.name,
    buyerReference: buyer.reference,
    buyerAgent: buyer.agent,
  })
  if (!hasBuyerIdentity(parsed)) return null
  return {
    email: parsed.email ?? undefined,
    name: parsed.name ?? undefined,
    reference: parsed.reference ?? undefined,
    agent: parsed.agent ?? undefined,
  }
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
  const status = computeStatus(lineItems, issues, totals)
  return {
    id: input.id,
    status,
    currency,
    lineItems,
    issues,
    totals,
    buyer: normalizeBuyer(input.buyer),
    approval: status === 'ready' ? approvalFrom(totals, lineItems) : null,
    source: { slug: input.page.slug, pageName: input.page.name },
  }
}

/** Apply an update: optionally replace the cart and/or set the buyer, then
 * re-resolve and recompute. Only valid on a live (`pending`/`ready`) session -
 * a completed or canceled session is terminal and throws. When `items` is
 * omitted the existing line items are re-priced against the (possibly changed)
 * page, so a re-supplied page can flip an issue to `ready` or vice versa.
 *
 * APPROVAL: supplying `items` means the agent deliberately changed the cart, so any
 * prior authorization is discarded and re-frozen against the new one. Omitting
 * `items` is a pure re-price (this is what /complete does), and the existing
 * approval is carried through UNTOUCHED so `checkApprovalDrift` has a stable
 * reference to judge the re-priced totals against. */
export function updateSession(
  session: CheckoutSession,
  patch: { page: SessionPage; items?: RequestedLineItem[]; buyer?: SessionBuyer | null },
): CheckoutSession {
  if (session.status === 'completed' || session.status === 'canceled') {
    throw new Error(`Cannot update a ${session.status} checkout session.`)
  }
  const currency = normalizeCurrency(patch.page.currency)
  const cartReplaced = patch.items !== undefined
  const requested: RequestedLineItem[] =
    patch.items ?? session.lineItems.map((li) => ({ offer: li.offerKey, quantity: li.quantity }))
  const { lineItems, issues } = resolveLineItems(patch.page, currency, requested)
  const totals = computeTotals(currency, lineItems)
  const status = computeStatus(lineItems, issues, totals)
  const buyer = patch.buyer === undefined ? session.buyer : normalizeBuyer(patch.buyer)
  const carried = cartReplaced ? null : session.approval
  return {
    ...session,
    status,
    currency,
    lineItems,
    issues,
    totals,
    buyer,
    approval: carried ?? (status === 'ready' ? approvalFrom(totals, lineItems) : null),
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

export type ApprovalDrift =
  | { ok: true }
  | {
      ok: false
      code: 'currency_changed' | 'cart_changed' | 'amount_increased'
      message: string
      approved: SessionApproval
      current: SessionApproval
    }

/** Compare a re-priced session against what the buyer actually authorized. Call this
 * AFTER the settlement-time re-price and BEFORE charging.
 *
 * Settles: an unchanged quote, or one that got CHEAPER (the buyer is charged the new
 * lower total, which needs no fresh authorization).
 * Refuses: a different currency, a different cart composition, or any increase.
 *
 * A session with no recorded approval passes. That is deliberate and narrow: only
 * rows created before the approval columns existed can be in that state, they expire
 * within the session lifetime, and failing them closed would strand every in-flight
 * checkout at deploy. Any session created by the current code that is payable also
 * carries an approval, because `createSession`/`updateSession` freeze one at `ready`. */
export function checkApprovalDrift(session: CheckoutSession): ApprovalDrift {
  const approved = session.approval
  if (!approved) return { ok: true }

  const current: SessionApproval = {
    amount: session.totals.total,
    currency: session.totals.currency,
    cartFingerprint: cartFingerprint(session.lineItems),
  }

  if (current.currency !== approved.currency) {
    return {
      ok: false,
      code: 'currency_changed',
      message: `This checkout was authorized in ${approved.currency.toUpperCase()} and is now priced in ${current.currency.toUpperCase()}. Re-confirm the order to continue.`,
      approved,
      current,
    }
  }
  if (current.cartFingerprint !== approved.cartFingerprint) {
    return {
      ok: false,
      code: 'cart_changed',
      message: 'The items in this checkout changed after it was authorized. Re-confirm the order to continue.',
      approved,
      current,
    }
  }
  if (current.amount > approved.amount) {
    return {
      ok: false,
      code: 'amount_increased',
      message: `The price rose from ${approved.amount} to ${current.amount} (${approved.currency.toUpperCase()}, minor units) after this checkout was authorized. Re-confirm the order to continue.`,
      approved,
      current,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Settlement bridge - TYPE SIGNATURE ONLY (implemented in SF2)
// ---------------------------------------------------------------------------

/** A delegated payment credential handed over by a protocol. The `kind` is NOT
 * decoration: each one charges through a different Stripe parameter, so the
 * settlement bridge switches on it (see `resolveCredentialParams`).
 *
 * - `shared_payment_token`: ACP's Stripe-issued SPT, id prefix `spt_`.
 * - `google_pay`: UCP's Google Pay credential, an ECv2 payload rather than an id.
 * - `payment_method`: a raw Stripe PaymentMethod id (`pm_`), used to prove the
 *   settlement path end-to-end against a Stripe test method. Both protocol orders
 *   in production settled this way, in test mode; no real delegated credential has
 *   ever been charged. */
export type DelegatedPayment = {
  token: string
  kind: 'payment_method' | 'shared_payment_token' | 'google_pay'
}

/** Everything the settlement layer needs beyond the resolved session. These are
 * resolved from the database by the bridge (owner plan → commission percent,
 * Connect account, suspension state) - deliberately NOT the pure core's concern, so a
 * protocol adapter never re-derives money/eligibility logic.
 *
 * INVARIANT: obtain this ONLY from `resolveSettlementContext` (settlement-bridge).
 * That resolver is where the suspension and charges_enabled gates live - a
 * hand-constructed context skips them and can charge an ineligible seller. Never build one
 * directly for a live charge. */
export type SettlementContext = {
  pageId: string
  ownerId: string | null
  /** The seller's Stripe Connect account the charge settles into (owner is
   * merchant of record). Required - a session with no Connect account is not
   * settleable and the bridge returns `no_connect`. */
  connectAccountId: string
  /** Effective owner plan and immutable rate provenance at settlement time. */
  planId: import('../billing').PlanId
  commissionBps: number
  commissionPercent: number
  commissionSource: import('../server/plan').CommissionResolution['source']
  /** Extra Stripe metadata the calling protocol adapter stamps onto the charge
   * (e.g. `nexez_source: 'acp'`, protocol order ids). The bridge merges these
   * with the money-core keys it derives from the session - so the bridge stays
   * provider-neutral and the adapter owns the channel labelling. */
  metadata?: Record<string, string>
  /** Optional Stripe idempotency key. When set, a retried settlement of the same
   * session returns the original charge instead of double-charging. Populated by
   * the inbound-auth / idempotency seam (SF5); omitted here means no key. */
  idempotencyKey?: string
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
      /** Stripe's immutable environment provenance for the settled PaymentIntent. */
      livemode: boolean
    }
  | {
      ok: false
      code: 'not_ready' | 'no_connect' | 'paused' | 'zero_amount' | 'stripe_error' | 'unsupported_credential'
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
