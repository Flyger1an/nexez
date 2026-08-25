// UCP wire mapping (pure) - the translation layer between Google's Universal Commerce
// Protocol JSON and the provider-neutral CheckoutSession core (SF1). Mirrors the ACP
// adapter in spirit; the differences are all wire shape: UCP nests the product id
// under `item.id`, uses an `incomplete|completed` status, carries `totals[]` + a
// `links{terms,privacy}` block, and delivers payment as a Google Pay token under
// `payment.instruments[].credential.token`. All money logic stays in the core.
//
// v1 scope: digital/service - no fulfillment options, tax=0.

import type {
  CheckoutSession,
  DelegatedPayment,
  RequestedLineItem,
  SessionBuyer,
  SessionStatus,
} from '../commerce/checkout-session-core'
import { UCP_TERMS_URL, UCP_PRIVACY_URL } from './constants'

/** UCP session status (the subset we emit). */
export type UcpStatus = 'incomplete' | 'completed' | 'canceled'

/** UCP has no ready/not-ready distinction in its status enum - anything not settled
 * or canceled is `incomplete` (readiness is gated internally before /complete charges). */
export function toUcpStatus(status: SessionStatus): UcpStatus {
  if (status === 'completed') return 'completed'
  if (status === 'canceled') return 'canceled'
  return 'incomplete'
}

export type UcpError = { type: string; code: string; message: string; field?: string }

export function ucpError(code: string, message: string, field?: string, type = 'invalid_request'): UcpError {
  return { type, code, message, ...(field ? { field } : {}) }
}

// ---------------------------------------------------------------------------
// Inbound: UCP request → core inputs
// ---------------------------------------------------------------------------

export type ParsedUcpLineItems =
  | { ok: true; slug: string; items: RequestedLineItem[] }
  | { ok: false; error: UcpError }

/** Parse UCP `line_items[{ item: { id }, quantity }]` into a single merchant slug +
 * core RequestedLineItem[]. The item id is the feed id `"<slug>:<offerKey>"`. ENFORCES
 * single-merchant (cross-tenant guard) - mixed merchants are rejected. */
export function parseUcpLineItems(lineItems: unknown): ParsedUcpLineItems {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { ok: false, error: ucpError('missing_line_items', 'line_items must be a non-empty array.', 'line_items') }
  }
  let slug: string | null = null
  const items: RequestedLineItem[] = []
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i] as { item?: { id?: unknown }; quantity?: unknown } | null
    const id = typeof li?.item?.id === 'string' ? li.item.id : ''
    const sep = id.indexOf(':')
    if (sep <= 0 || sep >= id.length - 1) {
      return { ok: false, error: ucpError('invalid_item_id', `line_items[${i}].item.id must be "<slug>:<offer>".`, `line_items[${i}].item.id`) }
    }
    const itemSlug = id.slice(0, sep)
    const offerKey = id.slice(sep + 1)
    if (slug === null) {
      slug = itemSlug
    } else if (slug !== itemSlug) {
      return { ok: false, error: ucpError('mixed_merchant', 'All line_items must belong to the same merchant.', `line_items[${i}].item.id`) }
    }
    const quantity = li?.quantity == null ? 1 : Number(li.quantity)
    items.push({ offer: offerKey, quantity })
  }
  return { ok: true, slug: slug as string, items }
}

/** Parse the UCP buyer from `buyer` / `contact` / `billing_address` (guest default). */
export function parseUcpBuyer(body: { buyer?: unknown; contact?: unknown; billing_address?: unknown } | null | undefined): SessionBuyer | null {
  if (!body) return null
  const src = (body.buyer ?? body.contact ?? body.billing_address) as { name?: unknown; email?: unknown } | undefined
  if (!src || typeof src !== 'object') return null
  const buyer: SessionBuyer = {
    name: typeof src.name === 'string' ? src.name : undefined,
    email: typeof src.email === 'string' ? src.email : undefined,
  }
  return buyer.name || buyer.email ? buyer : null
}

export type ParsedUcpPaymentCredential =
  | { ok: true; payment: Extract<DelegatedPayment, { kind: 'google_pay' }> }
  | { ok: false; error: UcpError }

/** Parse the selected UCP Google Pay instrument and bind it to the handler instance
 * Nexez declared. Multiple instruments are accepted only when exactly one is marked
 * selected. The opaque gateway payload is trimmed at its boundary but never decoded,
 * transformed, or treated as a Stripe PaymentMethod id. */
export function parseUcpPaymentCredential(
  payment: unknown,
  expectedHandlerId: string,
): ParsedUcpPaymentCredential {
  if (!payment || typeof payment !== 'object') {
    return { ok: false, error: ucpError('missing_payment', 'payment with a Google Pay credential is required.', 'payment') }
  }
  const p = payment as { instruments?: unknown }
  if (!Array.isArray(p.instruments) || p.instruments.length === 0) {
    return { ok: false, error: ucpError('missing_payment', 'payment.instruments must include a Google Pay credential.', 'payment.instruments') }
  }

  const instruments = p.instruments.filter((instrument): instrument is Record<string, unknown> => Boolean(instrument && typeof instrument === 'object'))
  const selected = instruments.filter((instrument) => instrument.selected === true)
  const instrument = instruments.length === 1 ? instruments[0] : selected.length === 1 ? selected[0] : null
  if (!instrument) {
    return { ok: false, error: ucpError('ambiguous_payment_instrument', 'Exactly one payment instrument must be selected.', 'payment.instruments') }
  }

  const handlerId = typeof instrument.handler_id === 'string' ? instrument.handler_id.trim() : ''
  if (!handlerId || handlerId !== expectedHandlerId) {
    return { ok: false, error: ucpError('payment_handler_mismatch', 'The selected instrument does not match this checkout payment handler.', 'payment.instruments[].handler_id') }
  }
  const credential = instrument.credential
  if (!credential || typeof credential !== 'object') {
    return { ok: false, error: ucpError('missing_payment', 'The selected instrument has no payment credential.', 'payment.instruments[].credential') }
  }
  const typedCredential = credential as { type?: unknown; token?: unknown }
  if (typedCredential.type !== 'PAYMENT_GATEWAY') {
    return { ok: false, error: ucpError('unsupported_payment_credential', 'The selected instrument must contain a PAYMENT_GATEWAY credential.', 'payment.instruments[].credential.type') }
  }
  const token = typeof typedCredential.token === 'string' ? typedCredential.token.trim() : ''
  if (!token) {
    return { ok: false, error: ucpError('missing_payment', 'The selected instrument has no payment token.', 'payment.instruments[].credential.token') }
  }

  return {
    ok: true,
    payment: { kind: 'google_pay', token, handlerId, credentialType: 'PAYMENT_GATEWAY' },
  }
}

// ---------------------------------------------------------------------------
// Outbound: core CheckoutSession → UCP session JSON
// ---------------------------------------------------------------------------

export type UcpLineItem = {
  item: { id: string }
  quantity: number
  base_amount: number
  subtotal: number
  total: number
}

export type UcpTotal = { type: string; amount: number }

export type UcpOrderRef = { id: string; label: string; permalink_url: string; status: string }

export type UcpCheckoutSession = {
  id: string
  status: UcpStatus
  currency: string
  line_items: UcpLineItem[]
  totals: UcpTotal[]
  links: { terms: string; privacy: string }
  buyer: { name?: string; email?: string } | null
  order?: UcpOrderRef
}

/** Project the core CheckoutSession into the UCP session shape. Amounts are minor
 * units. `order` is attached only on a completed session. */
export function toUcpCheckoutSession(session: CheckoutSession, opts: { order?: UcpOrderRef } = {}): UcpCheckoutSession {
  const line_items: UcpLineItem[] = session.lineItems.map((li) => ({
    item: { id: `${session.source.slug}:${li.offerKey}` },
    quantity: li.quantity,
    base_amount: li.unitAmount,
    subtotal: li.subtotal,
    total: li.subtotal,
  }))

  const totals: UcpTotal[] = [
    { type: 'subtotal', amount: session.totals.subtotal },
    { type: 'fulfillment', amount: 0 },
    { type: 'tax', amount: session.totals.tax },
    { type: 'total', amount: session.totals.total },
  ]

  const buyer = session.buyer
    ? {
        ...(session.buyer.name ? { name: session.buyer.name } : {}),
        ...(session.buyer.email ? { email: session.buyer.email } : {}),
      }
    : null

  return {
    id: session.id,
    status: toUcpStatus(session.status),
    currency: session.currency,
    line_items,
    totals,
    links: { terms: UCP_TERMS_URL, privacy: UCP_PRIVACY_URL },
    buyer,
    ...(opts.order ? { order: opts.order } : {}),
  }
}
