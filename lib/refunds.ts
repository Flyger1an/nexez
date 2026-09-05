// Cumulative-refunded ledger math for in-app PARTIAL refunds. Pure + client-safe
// (no Stripe / no secrets) so both refund routes - negotiation escrow + direct
// checkout orders - share one well-tested implementation.
//
// All amounts are in Stripe smallest-unit (¥1 = 1, $1 = 100), i.e. the same unit as
// charge.amount_refunded / session.amount_total. The cap is (captured − alreadyRefunded);
// Durable reservations and provider reconciliation live in server/refund-operation.

export type RefundPlan =
  | { ok: true; refundAmount: number; newTotal: number; fully: boolean }
  | { ok: false; error: string; status: number }

export function planRefund(opts: {
  /** Captured/refundable charge amount, Stripe smallest-unit. */
  capturedAmount: number
  /** Cumulative already refunded so far, Stripe smallest-unit. */
  alreadyRefunded: number
  /** Requested partial amount (Stripe smallest-unit). null/undefined = full remainder. */
  requestedAmount?: number | null
}): RefundPlan {
  const captured = Math.floor(opts.capturedAmount)
  const already = Math.max(0, Math.floor(opts.alreadyRefunded))
  if (!Number.isFinite(captured) || captured <= 0) {
    return { ok: false, error: 'This payment has no captured amount to refund.', status: 409 }
  }
  const remaining = captured - already
  if (remaining <= 0) {
    return { ok: false, error: 'This payment is already fully refunded.', status: 409 }
  }

  let refundAmount: number
  if (opts.requestedAmount == null) {
    refundAmount = remaining // full remainder
  } else {
    if (!Number.isFinite(opts.requestedAmount)) {
      return { ok: false, error: 'Invalid refund amount.', status: 400 }
    }
    refundAmount = Math.floor(opts.requestedAmount)
    if (refundAmount <= 0) {
      return { ok: false, error: 'Refund amount must be greater than zero.', status: 400 }
    }
    if (refundAmount > remaining) {
      return { ok: false, error: 'Refund amount exceeds the refundable remainder.', status: 409 }
    }
  }

  const newTotal = already + refundAmount
  return { ok: true, refundAmount, newTotal, fully: newTotal >= captured }
}

/** A stable key for one immutable, persisted user operation. */
export function refundIdempotencyKey(operationId: string): string {
  return `nexez-refund-${operationId}`
}
