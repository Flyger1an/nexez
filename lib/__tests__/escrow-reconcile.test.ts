import { describe, it, expect } from 'vitest'
import { reconcilePaymentState } from '../escrow-reconcile'

describe('reconcilePaymentState', () => {
  it('heals held/agreement_proposed forward to complete when the PI succeeded', () => {
    expect(reconcilePaymentState({ status: 'held', piStatus: 'succeeded' })).toMatchObject({ heal: true, toStatus: 'complete' })
    expect(reconcilePaymentState({ status: 'agreement_proposed', piStatus: 'succeeded' })).toMatchObject({ heal: true, toStatus: 'complete' })
  })

  it('heals to declined when the PI was canceled while we still show it live', () => {
    expect(reconcilePaymentState({ status: 'held', piStatus: 'canceled' })).toMatchObject({ heal: true, toStatus: 'declined' })
    expect(reconcilePaymentState({ status: 'agreement_proposed', piStatus: 'canceled' })).toMatchObject({ heal: true, toStatus: 'declined' })
  })

  it('refund/dispute on the charge wins regardless of local status', () => {
    expect(reconcilePaymentState({ status: 'complete', piStatus: 'succeeded', refunded: true })).toMatchObject({ heal: true, toStatus: 'refunded' })
    expect(reconcilePaymentState({ status: 'complete', piStatus: 'succeeded', disputed: true })).toMatchObject({ heal: true, toStatus: 'disputed' })
  })

  it('leaves consistent states alone', () => {
    expect(reconcilePaymentState({ status: 'complete', piStatus: 'succeeded' })).toMatchObject({ heal: false })
    expect(reconcilePaymentState({ status: 'held', piStatus: 'requires_capture' })).toMatchObject({ heal: false })
  })

  it('alerts (does not guess) on contradictory drift', () => {
    expect(reconcilePaymentState({ status: 'complete', piStatus: 'canceled' })).toMatchObject({ heal: false, alert: true })
    expect(reconcilePaymentState({ status: 'complete', piStatus: 'requires_capture' })).toMatchObject({ heal: false, alert: true })
    expect(reconcilePaymentState({ status: 'declined', piStatus: 'requires_capture' })).toMatchObject({ heal: false, alert: true })
  })

  it('alerts when the PI is unreadable but we still think money is active', () => {
    expect(reconcilePaymentState({ status: 'held', piStatus: null })).toMatchObject({ heal: false, alert: true })
    expect(reconcilePaymentState({ status: 'complete', piStatus: null })).toMatchObject({ heal: false, alert: true })
  })

  it('does nothing for pending PI states', () => {
    expect(reconcilePaymentState({ status: 'agreement_proposed', piStatus: 'processing' })).toMatchObject({ heal: false })
    expect(reconcilePaymentState({ status: 'agreement_proposed', piStatus: 'requires_payment_method' })).toMatchObject({ heal: false })
  })

  it('does not re-heal an already-refunded/disputed negotiation', () => {
    expect(reconcilePaymentState({ status: 'refunded', piStatus: 'succeeded', refunded: true })).toMatchObject({ heal: false })
    expect(reconcilePaymentState({ status: 'disputed', piStatus: 'succeeded', disputed: true })).toMatchObject({ heal: false })
  })
})
