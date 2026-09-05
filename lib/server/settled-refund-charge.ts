import 'server-only'
import type Stripe from 'stripe'

/** A charge's aggregate can include refunds still awaiting settlement. */
export async function settledRefundCharge(stripe: Stripe, chargeId: string, options: Stripe.RequestOptions = {}) {
  const charge = await stripe.charges.retrieve(chargeId, {}, options)
  let total = 0
  let cursor: string | undefined
  const seen = new Set<string>()
  for (let page = 0; page < 10; page++) {
    const refunds = await stripe.refunds.list({ charge: chargeId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options)
    for (const refund of refunds.data) {
      const refundCharge = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id
      if (seen.has(refund.id) || refundCharge !== charge.id || refund.currency !== charge.currency
        || !Number.isSafeInteger(refund.amount) || refund.amount <= 0) {
        throw new Error('Provider refund list does not match this charge.')
      }
      seen.add(refund.id)
      if (refund.status === 'canceled') continue
      if (refund.status === 'failed') {
        // A bank can return a previously submitted refund. That is an accounting
        // exception requiring review, not permission to automatically pay twice.
        throw new Error(`Failed refund ${refund.id} requires provider reconciliation.`)
      }
      if (refund.status !== 'succeeded') throw new Error(`Refund ${refund.id} is still pending settlement.`)
      total += refund.amount
    }
    if (!refunds.has_more) {
      if (!Number.isSafeInteger(total) || total > charge.amount) throw new Error('Invalid settled refund total.')
      return { ...charge, amount_refunded: total }
    }
    cursor = refunds.data.at(-1)?.id
    if (!cursor) throw new Error('Provider refund pagination did not advance.')
  }
  throw new Error('Refund history exceeds automatic reconciliation limits.')
}
