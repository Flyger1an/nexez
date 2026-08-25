import 'server-only'

/**
 * Live Stripe Connect balance + payouts for the seller's connected account, for
 * the Finance dashboard's Payouts panel. Server-only (reads STRIPE_SECRET_KEY).
 * Returns null gracefully when the seller hasn't connected or Stripe isn't
 * configured - non-fatal, the dashboard falls back to the connect CTA. Amounts are
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
  accountCountry: string | null
  defaultPayoutCurrency: string | null
}

/**
 * The soonest in-flight payout (pending/in_transit with an arrival estimate), for
 * the "Next payout" headline. Returns null when none - Stripe gives an estimate,
 * not a guaranteed date or a schedule, so the UI says "next expected", not a cadence.
 */
export function getNextPayout(snapshot: PayoutSnapshot | null): PayoutLine | null {
  if (!snapshot) return null
  const inFlight = snapshot.payouts.filter(
    (p) => (p.status === 'pending' || p.status === 'in_transit') && p.arrivalDate != null,
  )
  if (!inFlight.length) return null
  return inFlight.reduce((soonest, p) => ((p.arrivalDate ?? Infinity) < (soonest.arrivalDate ?? Infinity) ? p : soonest))
}

export async function getConnectPayoutSnapshot(connectAccountId: string | null | undefined): Promise<PayoutSnapshot | null> {
  if (!connectAccountId || !process.env.STRIPE_SECRET_KEY) return null
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    return loadConnectPayoutSnapshot(stripe, connectAccountId)
  } catch {
    return null
  }
}

export async function loadConnectPayoutSnapshot(
  stripe: Pick<Stripe, 'balance' | 'payouts' | 'accounts'>,
  connectAccountId: string,
): Promise<PayoutSnapshot | null> {
  try {
    const [balance, payouts, account] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: connectAccountId }),
      stripe.payouts.list({ limit: 8 }, { stripeAccount: connectAccountId }),
      stripe.accounts.retrieve(connectAccountId).catch(() => null),
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
      accountCountry: account?.country?.trim().toUpperCase() || null,
      defaultPayoutCurrency: account?.default_currency?.trim().toLowerCase() || null,
    }
  } catch {
    return null
  }
}
