// Cumulative-refunded ledger math for in-app PARTIAL refunds. Pure + client-safe
// (no Stripe / no secrets) so both refund routes - negotiation escrow + direct
// checkout orders - share one well-tested implementation.
//
// All amounts are in Stripe smallest-unit (¥1 = 1, $1 = 100), i.e. the same unit as
// charge.amount_refunded / session.amount_total. The cap is (captured − alreadyRefunded);
// idempotency is keyed on the NEW running total so two equal-amount partials get
// DISTINCT keys (the collision that made partials unsafe - Stripe would otherwise
// return the cached first refund and silently under-refund the buyer) while a genuine
// retry of the same intended total dedupes. Stripe's own server-side ceiling (it
// rejects refunds beyond the refundable remainder) is the final backstop.

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

/**
 * Stripe idempotency key for a refund, namespaced by row id + the RESULTING cumulative
 * total. Equal-amount partials produce distinct keys (no collision); a retry of the
 * same intended total reuses the key so Stripe dedupes it.
 */
export function refundIdempotencyKey(prefix: string, id: string, newTotal: number): string {
  return `${prefix}-${id}-${newTotal}`
}
