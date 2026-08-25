import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { loadConnectPayoutSnapshot } from './connect-finance'

function stripeClient(input: { accountFails?: boolean } = {}) {
  return {
    balance: {
      retrieve: vi.fn(async () => ({
        available: [{ amount: 1200, currency: 'usd' }],
        pending: [{ amount: 500, currency: 'eur' }],
      })),
    },
    payouts: {
      list: vi.fn(async () => ({
        data: [{ id: 'po_1', amount: 900, currency: 'usd', status: 'pending', arrival_date: 1787702400 }],
      })),
    },
    accounts: {
      retrieve: vi.fn(async () => {
        if (input.accountFails) throw new Error('restricted account metadata')
        return { country: 'gb', default_currency: 'GBP' }
      }),
    },
  } as unknown as Pick<Stripe, 'balance' | 'payouts' | 'accounts'>
}

describe('loadConnectPayoutSnapshot', () => {
  it('keeps balances by currency and adds Stripe-backed account region context', async () => {
    await expect(loadConnectPayoutSnapshot(stripeClient(), 'acct_1')).resolves.toEqual({
      available: [{ amountCents: 1200, currency: 'usd' }],
      pending: [{ amountCents: 500, currency: 'eur' }],
      payouts: [{ id: 'po_1', amountCents: 900, currency: 'usd', status: 'pending', arrivalDate: 1787702400 }],
      accountCountry: 'GB',
      defaultPayoutCurrency: 'gbp',
    })
  })

  it('keeps payout balances available when Stripe withholds optional account metadata', async () => {
    const snapshot = await loadConnectPayoutSnapshot(stripeClient({ accountFails: true }), 'acct_1')
    expect(snapshot).toMatchObject({
      available: [{ amountCents: 1200, currency: 'usd' }],
      accountCountry: null,
      defaultPayoutCurrency: null,
    })
  })

  it('fails closed when authoritative balance or payout data cannot load', async () => {
    const stripe = stripeClient()
    vi.mocked(stripe.balance.retrieve).mockRejectedValueOnce(new Error('Stripe unavailable'))
    await expect(loadConnectPayoutSnapshot(stripe, 'acct_1')).resolves.toBeNull()
  })
})
