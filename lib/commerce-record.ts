import { minorToStripeAmount } from './currency'

export type CommerceRail = 'checkout' | 'negotiated'
export type CommerceTone = 'ready' | 'attention' | 'danger' | 'signal' | 'muted'

export type CommerceStatus = {
  key: string
  label: string
  tone: CommerceTone
}

export type CommerceRecord = {
  key: string
  id: string
  rail: CommerceRail
  railLabel: string
  offerName: string
  buyerLabel: string
  buyerEmail: string | null
  channelLabel: string
  sourceStatus: CommerceStatus
  paymentState: CommerceStatus
  fulfillmentState: CommerceStatus | null
  amountCents: number | null
  amountRole: 'recorded_payment' | 'commercial_terms'
  amountLabel: string
  currency: string
  mode: 'live' | 'test' | 'unverified'
  createdAt: string
  updatedAt: string
  href: string
  actionLabel: string
}

export type CheckoutCommerceSource = {
  id: string
  offer_name: string | null
  amount_cents: number
  currency: string
  status: string
  channel: string | null
  refunded_cents: number | null
  buyer_email: string | null
  buyer_name: string | null
  buyer_reference: string | null
  buyer_agent: string | null
  stripe_livemode: boolean | null
  created_at: string
  updated_at: string
}

export type NegotiatedCommerceSource = {
  id: string
  offer_name: string | null
  amount_cents: number | null
  currency: string
  status: string
  escrow_mode: string | null
  refunded_cents: number | null
  buyer_email: string | null
  contact: string | null
  buyer_agent: string | null
  stripe_payment_intent_id: string | null
  stripe_livemode: boolean | null
  created_at: string
  updated_at: string
}

export type CheckoutFulfillmentSource = {
  order_id: string
  status: 'not_started' | 'in_progress' | 'fulfilled'
}

const CHECKOUT_CHANNEL_LABELS: Record<string, string> = {
  agent_checkout: 'Agent checkout',
  acp: 'Agent checkout',
  ucp: 'Agent checkout',
  nexie: 'Nexie',
  recurring_service: 'Recurring service',
  staged_settlement: 'Staged payments',
  reservable_resource: 'Reservation',
}

const NEGOTIATION_STATUS_LABELS: Record<string, string> = {
  negotiation: 'Proposal received',
  agreement_proposed: 'Agreement proposed',
  paused: 'Paused',
  held: 'Funds held',
  complete: 'Complete',
  declined: 'Declined',
  expired: 'Expired',
  refunded: 'Refunded',
  disputed: 'Disputed',
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())
}

function mode(value: boolean | null): CommerceRecord['mode'] {
  return value === true ? 'live' : value === false ? 'test' : 'unverified'
}

function buyerLabel(input: {
  buyerName?: string | null
  buyerEmail?: string | null
  buyerReference?: string | null
  buyerAgent?: string | null
  contact?: string | null
}) {
  return input.buyerName
    || input.buyerEmail
    || input.buyerReference
    || input.contact
    || input.buyerAgent
    || 'Customer details unavailable'
}

function checkoutStatus(row: CheckoutCommerceSource): CommerceStatus {
  if (row.status === 'paid' && Number(row.refunded_cents) > 0) {
    return { key: 'partial_refund', label: 'Partial refund', tone: 'attention' }
  }
  if (row.status === 'paid') return { key: 'paid', label: 'Paid', tone: 'ready' }
  if (row.status === 'disputed') return { key: row.status, label: 'Disputed', tone: 'danger' }
  if (row.status === 'refunded') return { key: row.status, label: 'Refunded', tone: 'muted' }
  if (row.status === 'dispute_won') return { key: row.status, label: 'Dispute won', tone: 'ready' }
  return { key: row.status, label: titleCase(row.status), tone: 'muted' }
}

function negotiationStatus(status: string): CommerceStatus {
  const label = NEGOTIATION_STATUS_LABELS[status] ?? titleCase(status)
  if (status === 'disputed') return { key: status, label, tone: 'danger' }
  if (status === 'negotiation' || status === 'held') return { key: status, label, tone: 'attention' }
  if (status === 'agreement_proposed') return { key: status, label, tone: 'signal' }
  if (status === 'complete') return { key: status, label, tone: 'ready' }
  return { key: status, label, tone: 'muted' }
}

function negotiationPaymentState(row: NegotiatedCommerceSource): CommerceStatus {
  if (!row.stripe_payment_intent_id) {
    return { key: 'not_recorded', label: 'No Nexez payment', tone: 'muted' }
  }
  if (row.status === 'held') return { key: 'held', label: 'Funds held', tone: 'attention' }
  if (row.status === 'complete') return { key: 'captured', label: 'Payment collected', tone: 'ready' }
  if (row.status === 'refunded') return { key: 'refunded', label: 'Refunded', tone: 'muted' }
  if (row.status === 'disputed') return { key: 'disputed', label: 'Disputed', tone: 'danger' }
  return { key: 'intent_created', label: 'Payment intent created', tone: 'signal' }
}

function fulfillmentState(row: CheckoutFulfillmentSource | null): CommerceStatus | null {
  if (!row) return null
  if (row.status === 'fulfilled') return { key: row.status, label: 'Fulfilled', tone: 'ready' }
  if (row.status === 'in_progress') return { key: row.status, label: 'In progress', tone: 'signal' }
  return { key: row.status, label: 'Not started', tone: 'muted' }
}

export function normalizeCheckoutCommerceRecord(
  row: CheckoutCommerceSource,
  fulfillment: CheckoutFulfillmentSource | null = null,
): CommerceRecord {
  const status = checkoutStatus(row)
  return {
    key: `checkout:${row.id}`,
    id: row.id,
    rail: 'checkout',
    railLabel: 'Order',
    offerName: row.offer_name || 'Order',
    buyerLabel: buyerLabel({
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      buyerReference: row.buyer_reference,
      buyerAgent: row.buyer_agent,
    }),
    buyerEmail: row.buyer_email,
    channelLabel: row.channel ? CHECKOUT_CHANNEL_LABELS[row.channel] ?? titleCase(row.channel) : 'Direct checkout',
    sourceStatus: status,
    paymentState: status,
    fulfillmentState: fulfillmentState(fulfillment),
    amountCents: Math.max(0, Number(row.amount_cents) || 0),
    amountRole: 'recorded_payment',
    amountLabel: 'Recorded payment',
    currency: row.currency || 'usd',
    mode: mode(row.stripe_livemode),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    href: `/dashboard/orders/${row.id}`,
    actionLabel: 'Manage order',
  }
}

export function normalizeNegotiatedCommerceRecord(row: NegotiatedCommerceSource): CommerceRecord {
  const settledTerms = ['agreement_proposed', 'held', 'complete', 'refunded', 'disputed'].includes(row.status)
  return {
    key: `negotiated:${row.id}`,
    id: row.id,
    rail: 'negotiated',
    railLabel: 'Negotiated deal',
    offerName: row.offer_name || 'Negotiation',
    buyerLabel: buyerLabel({
      buyerEmail: row.buyer_email,
      contact: row.contact,
      buyerAgent: row.buyer_agent,
    }),
    buyerEmail: row.buyer_email,
    channelLabel: row.escrow_mode === 'not_configured' ? 'Negotiation' : 'Payment-protected deal',
    sourceStatus: negotiationStatus(row.status),
    paymentState: negotiationPaymentState(row),
    fulfillmentState: null,
    amountCents: row.amount_cents == null ? null : minorToStripeAmount(row.amount_cents, row.currency || 'usd'),
    amountRole: 'commercial_terms',
    amountLabel: settledTerms ? 'Agreed value' : 'Proposed value',
    currency: row.currency || 'usd',
    mode: mode(row.stripe_livemode),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    href: `/dashboard/negotiations#negotiation-${row.id}`,
    actionLabel: 'Open negotiation',
  }
}

export function mergeCommerceRecords(
  checkout: CommerceRecord[],
  negotiated: CommerceRecord[],
  limit: number,
) {
  return [...checkout, ...negotiated]
    .sort((left, right) => {
      const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      if (Number.isFinite(updated) && updated !== 0) return updated
      return right.key.localeCompare(left.key)
    })
    .slice(0, Math.max(0, limit))
}
