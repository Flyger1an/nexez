import { describe, expect, it } from 'vitest'
import { getStripeConnectPayoutReadiness } from '../stripe-connect-readiness'

describe('getStripeConnectPayoutReadiness', () => {
  it('is ready only when an account can both charge and pay out', () => {
    expect(getStripeConnectPayoutReadiness({
      stripe_connect_account_id: 'acct_ready',
      stripe_connect_charges_enabled: true,
      stripe_connect_payouts_enabled: true,
    })).toEqual({
      accountCreated: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      ready: true,
    })
  })

  it.each([
    [null, 'missing state'],
    [{ stripe_connect_account_id: null, stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true }, 'missing account'],
    [{ stripe_connect_account_id: '   ', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true }, 'blank account'],
    [{ stripe_connect_account_id: 'acct_partial', stripe_connect_charges_enabled: false, stripe_connect_payouts_enabled: true }, 'charges disabled'],
    [{ stripe_connect_account_id: 'acct_partial', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: false }, 'payouts disabled'],
    [{ stripe_connect_account_id: 'acct_partial', stripe_connect_charges_enabled: true }, 'payouts unknown'],
  ])('fails closed for %s (%s)', (input, _label) => {
    expect(getStripeConnectPayoutReadiness(input)).toMatchObject({ ready: false })
  })
})
