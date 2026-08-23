/**
 * Minimal Stripe Connect state that is safe to use in browser and mobile
 * clients. This module intentionally has no Stripe SDK or server-only imports.
 */
export type StripeConnectReadinessInput = {
  stripe_connect_account_id?: string | null
  stripe_connect_charges_enabled?: boolean | null
  stripe_connect_payouts_enabled?: boolean | null
} | null | undefined

export type StripeConnectPayoutReadiness = {
  accountCreated: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  ready: boolean
}

/**
 * A Connect account is ready for Nexez settlement only when the account exists
 * and Stripe has explicitly enabled both charges and payouts. Missing, stale,
 * or partially-complete state always fails closed.
 */
export function getStripeConnectPayoutReadiness(
  input: StripeConnectReadinessInput,
): StripeConnectPayoutReadiness {
  const accountCreated = typeof input?.stripe_connect_account_id === 'string'
    && input.stripe_connect_account_id.trim().length > 0
  const chargesEnabled = input?.stripe_connect_charges_enabled === true
  const payoutsEnabled = input?.stripe_connect_payouts_enabled === true

  return {
    accountCreated,
    chargesEnabled,
    payoutsEnabled,
    ready: accountCreated && chargesEnabled && payoutsEnabled,
  }
}
