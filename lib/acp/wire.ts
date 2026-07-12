// ACP wire mapping (pure) — the translation layer between OpenAI's Agentic Commerce
// Protocol JSON and the provider-neutral CheckoutSession core (SF1). All the money
// logic lives in the core; this only re-labels field names + shapes, so the adapter
// stays a thin, testable projection with no Stripe/DB/commission concerns.
//
// v1 scope: digital/service offers — no discounts, no fulfillment options, tax=0.
// The line_item / totals[] shapes carry the zeroed fields so adding tax/shipping
// later is additive, not breaking.

import type {
  CheckoutSession,
  RequestedLineItem,
  SessionBuyer,
  SessionStatus,
} from '../commerce/checkout-session-core'

/** ACP CheckoutSession.status (the subset we emit in v1). */
export type AcpStatus = 'not_ready_for_payment' | 'ready_for_payment' | 'completed' | 'canceled'

const STATUS_MAP: Record<SessionStatus, AcpStatus> = {
  pending: 'not_ready_for_payment',
  ready: 'ready_for_payment',
  completed: 'completed',
  canceled: 'canceled',
}

export function toAcpStatus(status: SessionStatus): AcpStatus {
  return STATUS_MAP[status]
}

/** ACP error object: {type, code, message, param(jsonpath)}. */
export type AcpError = { type: string; code: string; message: string; param?: string }

export function acpError(code: string, message: string, param?: string, type = 'invalid_request'): AcpError {
  return { type, code, message, ...(param ? { param } : {}) }
}

// ---------------------------------------------------------------------------
// Inbound: ACP request → core inputs
// ---------------------------------------------------------------------------

export type ParsedAcpLineItems =
  | { ok: true; slug: string; items: RequestedLineItem[] }
  | { ok: false; error: AcpError }

/**
 * Parse ACP `line_items[{id, quantity}]` into a single merchant slug + core
 * RequestedLineItem[]. The ACP item id is the feed item_id `"<slug>:<offerKey>"`.
 * ENFORCES single-merchant: a session that mixes merchants is a cross-tenant money
 * bug (mirrors the storefront MCP's foreign-slug rejection), so mixed slugs → error.
 */
export function parseAcpLineItems(lineItems: unknown): ParsedAcpLineItems {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { ok: false, error: acpError('missing_line_items', 'line_items must be a non-empty array.', '$.line_items') }
  }
  let slug: string | null = null
  const items: RequestedLineItem[] = []
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i] as { id?: unknown; quantity?: unknown } | null
    const id = typeof li?.id === 'string' ? li.id : ''
    // Split on the FIRST ':' — slugs are [a-z0-9-] (no colon); offer keys are
    // "services-N"/"products-N".
    const sep = id.indexOf(':')
    if (sep <= 0 || sep >= id.length - 1) {
      return { ok: false, error: acpError('invalid_item_id', `line_items[${i}].id must be "<slug>:<offer>".`, `$.line_items[${i}].id`) }
    }
    const itemSlug = id.slice(0, sep)
    const offerKey = id.slice(sep + 1)
    if (slug === null) {
      slug = itemSlug
    } else if (slug !== itemSlug) {
      return { ok: false, error: acpError('mixed_merchant', 'All line_items must belong to the same merchant.', `$.line_items[${i}].id`) }
    }
    const quantity = li?.quantity == null ? 1 : Number(li.quantity)
    items.push({ offer: offerKey, quantity })
  }
  return { ok: true, slug: slug as string, items }
}

/** Extract the delegated payment credential from ACP `payment_data`. The Shared
 * Payment Token lives at `payment_data.instrument.credential`; tolerate a couple of
 * flatter shapes so a version skew doesn't drop a valid token. Returns null when
 * absent/blank (the route rejects with a missing_payment error). */
export function parseAcpPaymentToken(paymentData: unknown): string | null {
  if (!paymentData || typeof paymentData !== 'object') return null
  const p = paymentData as { instrument?: { credential?: unknown }; token?: unknown; credential?: unknown }
  const candidate = p.instrument?.credential ?? p.token ?? p.credential
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

/** Parse the ACP buyer{name,email,phone} into the core's SessionBuyer (phone unused
 * in v1). Returns null when absent — the core re-sanitizes whatever we pass. */
export function parseAcpBuyer(raw: unknown): SessionBuyer | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as { name?: unknown; email?: unknown }
  const buyer: SessionBuyer = {
    name: typeof b.name === 'string' ? b.name : undefined,
    email: typeof b.email === 'string' ? b.email : undefined,
  }
  return buyer.name || buyer.email ? buyer : null
}

// ---------------------------------------------------------------------------
// Outbound: core CheckoutSession → ACP CheckoutSession JSON
// ---------------------------------------------------------------------------

export type AcpLineItem = {
  id: string
  item: { id: string; quantity: number }
  base_amount: number
  subtotal: number
  discount: number
  tax: number
  total: number
}

export type AcpTotal = { type: string; display_text: string; amount: number }

export type AcpBuyer = { name?: string; email?: string }

export type AcpOrderRef = {
  id: string
  checkout_session_id: string
  permalink_url: string
  status: string
}

export type AcpCheckoutSession = {
  id: string
  status: AcpStatus
  currency: string
  line_items: AcpLineItem[]
  totals: AcpTotal[]
  buyer: AcpBuyer | null
  messages: unknown[]
  order?: AcpOrderRef
}

/** Project the core CheckoutSession into the ACP CheckoutSession response shape.
 * Amounts are minor units (as the core stores them). `order` is attached only on a
 * completed session (returns CheckoutSessionWithOrder). */
export function toAcpCheckoutSession(session: CheckoutSession, opts: { order?: AcpOrderRef } = {}): AcpCheckoutSession {
  const line_items: AcpLineItem[] = session.lineItems.map((li) => ({
    id: li.offerKey,
    item: { id: `${session.source.slug}:${li.offerKey}`, quantity: li.quantity },
    base_amount: li.unitAmount,
    subtotal: li.subtotal,
    discount: 0,
    tax: 0,
    total: li.subtotal,
  }))

  const totals: AcpTotal[] = [
    { type: 'items_base_amount', display_text: 'Items', amount: session.totals.subtotal },
    { type: 'subtotal', display_text: 'Subtotal', amount: session.totals.subtotal },
    { type: 'tax', display_text: 'Tax', amount: session.totals.tax },
    { type: 'total', display_text: 'Total', amount: session.totals.total },
  ]

  const buyer: AcpBuyer | null = session.buyer
    ? {
        ...(session.buyer.name ? { name: session.buyer.name } : {}),
        ...(session.buyer.email ? { email: session.buyer.email } : {}),
      }
    : null

  return {
    id: session.id,
    status: toAcpStatus(session.status),
    currency: session.currency,
    line_items,
    totals,
    buyer,
    messages: [],
    ...(opts.order ? { order: opts.order } : {}),
  }
}
