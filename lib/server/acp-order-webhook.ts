import 'server-only'
import crypto from 'node:crypto'
import { ACP_API_VERSION } from '../acp/constants'

// Merchant → OpenAI order-status webhook (A4). ACP expects the merchant to notify
// OpenAI when an order's status changes AFTER the /complete response (refunds,
// disputes, fulfillment). Nexez's concrete async change is a refund/dispute, fired
// from the Stripe webhook's reversal handler.
//
// DORMANT until BOTH ACP_ORDER_WEBHOOK_URL and ACP_ORDER_WEBHOOK_SECRET are set at
// enrollment (owner-provided by OpenAI). Best-effort: never throws into the caller
// (call via after()); a failed emit is logged, not fatal - the durable order state
// lives in checkout_orders regardless. No secret is logged.
//
// The exact header names / signature encoding are confirmed at enrollment against
// OpenAI's partner spec; we default to a base64 HMAC-SHA256 of the raw body (matching
// ACP's inbound Signature convention) + a Timestamp, which is trivially adjustable.

/** ACP order.status vocabulary. */
export type AcpOrderStatus = 'created' | 'manual_review' | 'confirmed' | 'canceled' | 'shipped' | 'fulfilled'
export type AcpOrderEventType = 'order_created' | 'order_updated'
export type AcpOrderRefund = { type: string; amount: number; currency: string }

export type AcpOrderEventInput = {
  checkoutSessionId: string
  permalinkUrl: string
  status: AcpOrderStatus
  orderId?: string
  refunds?: AcpOrderRefund[]
}

export function acpOrderWebhookConfigured(): boolean {
  return Boolean(process.env.ACP_ORDER_WEBHOOK_URL && process.env.ACP_ORDER_WEBHOOK_SECRET)
}

/** Map a Nexez checkout_orders.status to the ACP order.status it reports to OpenAI. */
export function acpStatusFromOrderStatus(orderStatus: string | null | undefined): AcpOrderStatus {
  switch (orderStatus) {
    case 'refunded':
      return 'canceled'
    case 'disputed':
      return 'manual_review'
    case 'dispute_won':
    case 'paid':
      return 'confirmed'
    default:
      return 'confirmed'
  }
}

/** The ACP order event body: { type, data: { type:'order', ... } }. Pure. */
export function buildAcpOrderEvent(type: AcpOrderEventType, input: AcpOrderEventInput) {
  return {
    type,
    data: {
      type: 'order' as const,
      ...(input.orderId ? { id: input.orderId } : {}),
      checkout_session_id: input.checkoutSessionId,
      permalink_url: input.permalinkUrl,
      status: input.status,
      ...(input.refunds && input.refunds.length ? { refunds: input.refunds } : {}),
    },
  }
}

/** base64 HMAC-SHA256 of the raw JSON body, keyed by the merchant secret. */
export function signAcpOrderPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
}

export type AcpOrderEmitResult = { ok: boolean; skipped?: boolean; status?: number; error?: string }

/** Emit an order event to OpenAI. No-op (`skipped`) when unconfigured; best-effort -
 * never throws. `fetchImpl`/`nowIso` injectable for tests. */
export async function sendAcpOrderEvent(
  type: AcpOrderEventType,
  input: AcpOrderEventInput,
  opts: { fetchImpl?: typeof fetch; nowIso?: string } = {},
): Promise<AcpOrderEmitResult> {
  const url = process.env.ACP_ORDER_WEBHOOK_URL
  const secret = process.env.ACP_ORDER_WEBHOOK_SECRET
  if (!url || !secret) return { ok: false, skipped: true }

  const body = JSON.stringify(buildAcpOrderEvent(type, input))
  const signature = signAcpOrderPayload(body, secret)
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        signature,
        timestamp: opts.nowIso ?? new Date().toISOString(),
        'api-version': ACP_API_VERSION,
      },
      body,
    })
    if (!res.ok) console.warn(`[ACP] order webhook ${type} → ${res.status}`)
    return { ok: res.ok, status: res.status }
  } catch (error) {
    console.warn(`[ACP] order webhook ${type} failed:`, error instanceof Error ? error.message : 'unknown')
    return { ok: false, error: error instanceof Error ? error.message : 'fetch failed' }
  }
}
