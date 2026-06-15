import 'server-only'

/**
 * Live Stripe Connect balance + payouts for the seller's connected account, for
 * the Finance dashboard's Payouts panel. Server-only (reads STRIPE_SECRET_KEY).
 * Returns null gracefully when the seller hasn't connected or Stripe isn't
 * configured — non-fatal, the dashboard falls back to the connect CTA. Amounts are
 * in the currency's smallest unit (cents / whole-yen), formatCurrencyAmount-ready.
 */
import Stripe from 'stripe'

export type PayoutLine = {
  id: string
  amountCents: number
  currency: string
  status: string // paid | pending | in_transit | failed | canceled
  arrivalDate: number | null // unix seconds
}

export type PayoutSnapshot = {
  available: { amountCents: number; currency: string }[]
  pending: { amountCents: number; currency: string }[]
  payouts: PayoutLine[]
}

export async function getConnectPayoutSnapshot(connectAccountId: string | null | undefined): Promise<PayoutSnapshot | null> {
  if (!connectAccountId || !process.env.STRIPE_SECRET_KEY) return null
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: connectAccountId }),
      stripe.payouts.list({ limit: 8 }, { stripeAccount: connectAccountId }),
    ])
    return {
      available: (balance.available ?? []).map((b) => ({ amountCents: b.amount, currency: b.currency })),
      pending: (balance.pending ?? []).map((b) => ({ amountCents: b.amount, currency: b.currency })),
      payouts: (payouts.data ?? []).map((p) => ({
        id: p.id,
        amountCents: p.amount,
        currency: p.currency,
        status: p.status,
        arrivalDate: p.arrival_date ?? null,
      })),
    }
  } catch {
    return null
  }
}
