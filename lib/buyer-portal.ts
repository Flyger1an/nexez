// Pure, testable helpers for the buyer order portal (`/orders/<token>`). Buyers are
// anonymous — these turn the raw order/negotiation row (resolved server-side in
// lib/server/load-order.ts) into buyer-facing status copy, a timeline, and recourse
// eligibility. No secrets, no DB — safe to import anywhere + unit-test directly.

export type BuyerOrderKind = 'checkout' | 'negotiation'

export type BuyerRequestKind = 'refund_request' | 'problem_report'

export type BuyerOrderRequest = {
  id: string
  kind: BuyerRequestKind
  status: string
  message: string | null
  createdAt: string
}

// Normalized, buyer-safe view of an order/negotiation (no owner_id, no offer rules,
// no internal notes — the server resolver strips those before building this).
export type BuyerOrderView = {
  kind: BuyerOrderKind
  token: string
  reference: string // session id (checkout) or negotiation id — what the buyer can quote
  offerName: string | null
  amountCents: number | null
  currency: string
  status: string
  settlementState?: string | null
  sellerName: string | null
  sellerEmail: string | null
  buyerEmail: string | null
  slug: string | null
  createdAt: string
  requests: BuyerOrderRequest[]
}

// Lightweight summary for the "find my orders" list (one row per order). Each carries
// its own per-order portal token so the row links straight into the full view.
export type BuyerOrderSummary = {
  kind: BuyerOrderKind
  token: string
  offerName: string | null
  amountCents: number | null
  currency: string
  status: string
  sellerName: string | null
  slug: string | null
  createdAt: string
}

export type StatusTone = 'positive' | 'neutral' | 'warning' | 'pending'

export type StatusDescriptor = { label: string; tone: StatusTone; description: string }

// Map the raw order/negotiation status onto plain-language buyer copy. Covers both
// money paths; pre-payment negotiation states are handled gracefully even though a
// buyer usually only reaches the portal once a payment exists.
export function describeOrderStatus(kind: BuyerOrderKind, status: string): StatusDescriptor {
  const s = (status || '').toLowerCase()
  const map: Record<string, StatusDescriptor> = {
    paid: { label: 'Paid', tone: 'positive', description: 'Your payment went through. The seller has been notified.' },
    complete: { label: 'Completed', tone: 'positive', description: 'This order is complete.' },
    held: {
      label: 'Held in escrow',
      tone: 'pending',
      description: 'Your payment is held safely in escrow and is released to the seller once they deliver.',
    },
    agreement_proposed: {
      label: 'Agreement proposed',
      tone: 'pending',
      description: 'Terms have been proposed. Payment has not been collected yet.',
    },
    negotiation: {
      label: 'In negotiation',
      tone: 'pending',
      description: 'This deal is still being negotiated. No payment has been collected yet.',
    },
    refunded: { label: 'Refunded', tone: 'neutral', description: 'This payment was refunded to you in full.' },
    partial_refund: {
      label: 'Partially refunded',
      tone: 'neutral',
      description: 'Part of this payment was refunded to you.',
    },
    disputed: {
      label: 'Under dispute review',
      tone: 'warning',
      description: 'A dispute is open on this payment and is being reviewed by the card network.',
    },
    dispute_won: {
      label: 'Dispute resolved',
      tone: 'neutral',
      description: 'The dispute on this payment has been resolved.',
    },
    declined: { label: 'Declined', tone: 'neutral', description: 'This request was declined. No payment was collected.' },
    expired: { label: 'Expired', tone: 'neutral', description: 'This request expired. No payment was collected.' },
  }
  return (
    map[s] || {
      label: s ? s.replace(/_/g, ' ') : 'Unknown',
      tone: 'neutral',
      description: 'Check back here for the latest status.',
    }
  )
}

export type TimelineStep = { key: string; label: string; done: boolean; current: boolean }

// A small, honest progress timeline for the order. Reflects what actually happened —
// never implies a delivery/refund step that didn't occur.
export function buildOrderTimeline(view: BuyerOrderView): TimelineStep[] {
  const s = (view.status || '').toLowerCase()
  const refunded = s === 'refunded' || s === 'partial_refund'
  const disputed = s === 'disputed'
  const held = s === 'held'
  const settled = s === 'paid' || s === 'complete' || s === 'dispute_won'

  const steps: TimelineStep[] = [
    { key: 'placed', label: 'Order placed', done: true, current: false },
    {
      key: 'paid',
      label: held ? 'Payment held in escrow' : 'Payment received',
      done: settled || held || refunded || disputed,
      current: held,
    },
  ]

  if (disputed) {
    steps.push({ key: 'disputed', label: 'Dispute under review', done: false, current: true })
  } else if (refunded) {
    steps.push({ key: 'refunded', label: 'Refunded to you', done: true, current: true })
  } else {
    steps.push({
      key: 'complete',
      label: view.kind === 'negotiation' && held ? 'Awaiting delivery' : 'Complete',
      done: settled && !held,
      current: settled && !held,
    })
  }

  return steps
}

// Statuses where a payment exists that's worth asking the seller about. Already-
// refunded / declined / expired / pre-payment states have nothing to refund.
const REFUNDABLE_STATUSES = new Set(['paid', 'held', 'complete', 'disputed', 'dispute_won'])

export function isRefundableStatus(status: string): boolean {
  return REFUNDABLE_STATUSES.has((status || '').toLowerCase())
}

// Whether the buyer can still ask for a refund. A request is a NOTIFICATION to the
// seller (the seller refunds from Finance) — it never moves money.
export function canRequestRefund(view: BuyerOrderView): boolean {
  return isRefundableStatus(view.status)
}

// Whether a buyer already has an open request of this kind (so the UI can disable a
// duplicate submit instead of spamming the seller).
export function hasOpenRequest(view: BuyerOrderView, kind: BuyerRequestKind): boolean {
  return view.requests.some((r) => r.kind === kind && (r.status === 'open' || r.status === 'acknowledged'))
}

export const REQUEST_KIND_LABEL: Record<BuyerRequestKind, string> = {
  refund_request: 'Refund request',
  problem_report: 'Problem report',
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  open: 'Pending seller review',
  acknowledged: 'Seller is reviewing',
  resolved: 'Resolved',
  declined: 'Declined by seller',
}
