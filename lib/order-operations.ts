import { formatCurrencyAmount } from './currency'

export const FULFILLMENT_STATUSES = ['not_started', 'in_progress', 'fulfilled'] as const
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

export type OrderActivityEvent = {
  event_type: string
  source: 'system' | 'merchant' | 'buyer' | 'stripe'
  metadata: Record<string, unknown>
  created_at: string
}

export type OrderActivityPresentation = {
  title: string
  detail: string
  tone: 'neutral' | 'ready' | 'attention'
}

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  fulfilled: 'Fulfilled',
}

export function fulfillmentLabel(status: FulfillmentStatus | null | undefined) {
  return status ? FULFILLMENT_LABELS[status] : 'Not tracked'
}

export function fulfillmentDescription(status: FulfillmentStatus | null | undefined) {
  if (!status) return 'This order predates fulfillment tracking. Set a state only when the merchant can verify it.'
  if (status === 'not_started') return 'Payment is recorded, but work has not started.'
  if (status === 'in_progress') return 'The merchant has started fulfilling this order.'
  return 'The merchant marked the work represented by this order as fulfilled.'
}

export function fulfillmentCapability(input: {
  paymentStatus: string
  stagedObligationKind?: string | null
}) {
  if (input.paymentStatus === 'disputed') {
    return { enabled: false, reason: 'Fulfillment changes are paused while the payment is disputed.' }
  }
  if (input.paymentStatus === 'refunded') {
    return { enabled: false, reason: 'A fully refunded order cannot receive new fulfillment updates.' }
  }
  if (input.paymentStatus !== 'paid' && input.paymentStatus !== 'dispute_won') {
    return { enabled: false, reason: 'The current payment state does not allow fulfillment updates.' }
  }
  if (input.stagedObligationKind === 'commitment') {
    return { enabled: false, reason: 'This payment is a commitment stage, not delivered work. Fulfillment belongs on a milestone or completion payment.' }
  }
  return { enabled: true, reason: null }
}

export function refundCapability(input: {
  paymentStatus: string
  paymentIntentId: string | null
  amountCents: number
  refundedCents: number | null
}) {
  const remainingCents = Math.max(0, input.amountCents - Math.max(0, input.refundedCents ?? 0))
  if (input.paymentStatus !== 'paid') {
    return { enabled: false, remainingCents, reason: 'Only a paid order with a remaining captured balance can be refunded.' }
  }
  if (!input.paymentIntentId) {
    return { enabled: false, remainingCents, reason: 'This order has no captured payment reference.' }
  }
  if (!remainingCents) {
    return { enabled: false, remainingCents, reason: 'The captured balance has already been fully refunded.' }
  }
  return { enabled: true, remainingCents, reason: null }
}

export function refundConsequence(channel: string | null) {
  if (channel === 'recurring_service') return 'This refunds only this payment. It does not cancel future subscription periods.'
  if (channel === 'reservable_resource') return 'This refunds the payment. It does not release or restock the reserved resource.'
  if (channel === 'staged_settlement') return 'This refunds only this paid stage. It does not cancel the full staged agreement.'
  return 'A refund returns buyer funds and proportionally reverses the Nexez application fee.'
}

export function describeOrderActivity(event: OrderActivityEvent, currency: string): OrderActivityPresentation {
  const metadata = event.metadata || {}
  const status = stringValue(metadata.toStatus) || stringValue(metadata.status)
  const kind = stringValue(metadata.kind)
  const amount = numberValue(metadata.amountCents)
  const refunded = numberValue(metadata.refundedCents)

  switch (event.event_type) {
    case 'order_recorded':
      return { title: 'Order recorded', detail: `Durable ${stringValue(metadata.channel)?.replaceAll('_', ' ') || 'checkout'} order created.`, tone: 'neutral' }
    case 'payment_confirmed':
      return {
        title: 'Payment confirmed',
        detail: amount == null ? 'Stripe-confirmed payment recorded.' : `${formatCurrencyAmount(amount, stringValue(metadata.currency) || currency)} captured.`,
        tone: 'ready',
      }
    case 'fulfillment_updated':
      return { title: `Fulfillment ${fulfillmentLabel(asFulfillmentStatus(status)).toLowerCase()}`, detail: 'Merchant operational state updated.', tone: status === 'fulfilled' ? 'ready' : 'neutral' }
    case 'refund_recorded':
      return { title: 'Refund recorded', detail: refunded == null ? 'Stripe-confirmed refund recorded.' : `${formatCurrencyAmount(refunded, currency)} refunded in total.`, tone: 'attention' }
    case 'dispute_opened':
      return { title: 'Payment disputed', detail: stringValue(metadata.reason) ? `Stripe reason: ${stringValue(metadata.reason)}` : 'Stripe reported an open payment dispute.', tone: 'attention' }
    case 'dispute_resolved':
      return { title: 'Dispute resolved', detail: stringValue(metadata.outcome) === 'won' ? 'The merchant retained the payment.' : 'The dispute closed without retained funds.', tone: 'neutral' }
    case 'buyer_request_received':
      return { title: kind === 'refund_request' ? 'Refund requested' : 'Problem reported', detail: 'Buyer submitted a request from the order portal.', tone: 'attention' }
    case 'buyer_request_updated':
      return { title: `Buyer request ${humanize(status || 'updated')}`, detail: kind === 'refund_request' ? 'Refund request status changed.' : 'Problem report status changed.', tone: status === 'resolved' ? 'ready' : 'neutral' }
    case 'review_received':
      return { title: 'Verified review received', detail: numberValue(metadata.rating) == null ? 'Buyer feedback recorded.' : `${numberValue(metadata.rating)} out of 5 stars.`, tone: 'neutral' }
    case 'resource_reserved':
      return { title: 'Resource reserved', detail: 'Durable allocation lineage linked to this payment.', tone: 'ready' }
    case 'resource_fulfilled':
      return { title: 'Reserved resource fulfilled', detail: 'The linked reservation was marked fulfilled.', tone: 'ready' }
    default:
      return { title: humanize(event.event_type), detail: 'Durable order activity recorded.', tone: 'neutral' }
  }
}

function asFulfillmentStatus(value: string | null): FulfillmentStatus | null {
  return value && (FULFILLMENT_STATUSES as readonly string[]).includes(value) ? value as FulfillmentStatus : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
