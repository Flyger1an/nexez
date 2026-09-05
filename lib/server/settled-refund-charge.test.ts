import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { settledRefundCharge } from './settled-refund-charge'

const retrieve = vi.fn()
const list = vi.fn()
const stripe = { charges: { retrieve }, refunds: { list } } as unknown as Stripe
const refund = (id: string, amount: number, status = 'succeeded') => ({ id, amount, status, charge: 'ch_fixture', currency: 'usd' })

describe('provider refund settlement evidence', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    retrieve.mockResolvedValue({ id: 'ch_fixture', currency: 'usd', amount: 10000, amount_refunded: 10000, payment_intent: 'pi_fixture' })
  })
  it('paginates the current charge and sums successful refunds, ignoring canceled requests', async () => {
    list.mockResolvedValueOnce({ data: [refund('re_one', 2000)], has_more: true })
      .mockResolvedValueOnce({ data: [refund('re_two', 3000), refund('re_cancel', 4000, 'canceled')], has_more: false })
    expect(await settledRefundCharge(stripe, 'ch_fixture', { stripeAccount: 'acct_owner' })).toMatchObject({ amount_refunded: 5000 })
    expect(list).toHaveBeenLastCalledWith({ charge: 'ch_fixture', limit: 100, starting_after: 're_one' }, { stripeAccount: 'acct_owner' })
    expect(retrieve).toHaveBeenCalledWith('ch_fixture', {}, { stripeAccount: 'acct_owner' })
  })
  it.each(['pending', 'requires_action', null])('keeps an unsettled %s refund retryable', async (status) => {
    list.mockResolvedValue({ data: [{ ...refund('re_pending', 10000), status }], has_more: false })
    await expect(settledRefundCharge(stripe, 'ch_fixture')).rejects.toThrow('pending settlement')
    list.mockResolvedValue({ data: [refund('re_pending', 10000)], has_more: false })
    expect(await settledRefundCharge(stripe, 'ch_fixture')).toMatchObject({ amount_refunded: 10000 })
  })
  it('requires review for a failed refund instead of guessing whether to send more money', async () => {
    list.mockResolvedValue({ data: [refund('re_failed', 10000, 'failed')], has_more: false })
    await expect(settledRefundCharge(stripe, 'ch_fixture')).rejects.toThrow('requires provider reconciliation')
  })
  it('rejects a mismatched charge and repeated provider pagination entries', async () => {
    list.mockResolvedValue({ data: [{ ...refund('re_foreign', 1000), charge: 'ch_other' }], has_more: false })
    await expect(settledRefundCharge(stripe, 'ch_fixture')).rejects.toThrow('does not match')
    list.mockResolvedValue({ data: [refund('re_duplicate', 1000)], has_more: true })
    await expect(settledRefundCharge(stripe, 'ch_fixture')).rejects.toThrow('does not match')
  })
})
