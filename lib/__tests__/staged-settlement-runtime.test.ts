import { describe, expect, it } from 'vitest'
import {
  buildStagedSettlementAgreementSnapshot,
  canReadyStagedSettlementObligation,
  canTransitionStagedSettlementObligation,
  stagedSettlementAgreementStatus,
  stagedSettlementApprovalPayload,
} from '../staged-settlement-runtime'

describe('staged settlement runtime invariants', () => {
  const terms = {
    schemaVersion: 1 as const,
    paymentModel: 'staged-fixed-total' as const,
    approvalPolicy: 'buyer-approves-each-stage' as const,
    mutationPolicy: 'immutable-after-first-payment' as const,
    stages: [
      { id: 'deposit', label: 'Booking installment', kind: 'commitment' as const, allocationBps: 2500 },
      { id: 'completion', label: 'Completion payment', kind: 'completion' as const, allocationBps: 7500 },
    ],
  }

  it('builds one exact agreement snapshot from authoritative total and provenance', () => {
    expect(buildStagedSettlementAgreementSnapshot({
      terms,
      totalAmount: 10_001,
      currency: 'USD',
      offerConfiguration: { date: '2026-09-01' },
      pricingFingerprint: 'a'.repeat(64),
      fulfillmentFingerprint: 'b'.repeat(64),
    })).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        settlement: {
          schemaVersion: 1,
          terms,
          totalAmount: 10_001,
          currency: 'usd',
          stages: [
            { ...terms.stages[0], order: 1, amountCents: 2_500 },
            { ...terms.stages[1], order: 2, amountCents: 7_501 },
          ],
        },
        offerConfiguration: { date: '2026-09-01' },
        pricingFingerprint: 'a'.repeat(64),
        fulfillmentFingerprint: 'b'.repeat(64),
      },
    })
  })

  it('permits only explicit forward and authoritative reversal transitions', () => {
    expect(canTransitionStagedSettlementObligation('pending', 'ready_for_buyer_approval')).toBe(true)
    expect(canTransitionStagedSettlementObligation('ready_for_buyer_approval', 'payment_pending')).toBe(true)
    expect(canTransitionStagedSettlementObligation('payment_pending', 'paid')).toBe(true)
    expect(canTransitionStagedSettlementObligation('paid', 'disputed')).toBe(true)
    expect(canTransitionStagedSettlementObligation('disputed', 'refunded')).toBe(true)
    expect(canTransitionStagedSettlementObligation('pending', 'paid')).toBe(false)
    expect(canTransitionStagedSettlementObligation('paid', 'payment_pending')).toBe(false)
    expect(canTransitionStagedSettlementObligation('refunded', 'paid')).toBe(false)
  })

  it('readies only the next pending obligation after every predecessor is paid', () => {
    const obligations = [
      { stageOrder: 1, status: 'paid' as const },
      { stageOrder: 2, status: 'pending' as const },
      { stageOrder: 3, status: 'pending' as const },
    ]
    expect(canReadyStagedSettlementObligation({ stageOrder: 2, obligations })).toBe(true)
    expect(canReadyStagedSettlementObligation({ stageOrder: 3, obligations })).toBe(false)
    expect(canReadyStagedSettlementObligation({
      stageOrder: 2,
      obligations: [{ stageOrder: 1, status: 'disputed' }, ...obligations.slice(1)],
    })).toBe(false)
  })

  it('never allows two buyer-payable obligations at once', () => {
    expect(canReadyStagedSettlementObligation({
      stageOrder: 2,
      obligations: [
        { stageOrder: 1, status: 'paid' },
        { stageOrder: 2, status: 'pending' },
        { stageOrder: 3, status: 'ready_for_buyer_approval' },
      ],
    })).toBe(false)
  })

  it('derives agreement state without calling a deposit full payment', () => {
    expect(stagedSettlementAgreementStatus(['ready_for_buyer_approval', 'pending'])).toBe('pending')
    expect(stagedSettlementAgreementStatus(['paid', 'pending'])).toBe('active')
    expect(stagedSettlementAgreementStatus(['paid', 'paid'])).toBe('complete')
    expect(stagedSettlementAgreementStatus(['paid', 'disputed'])).toBe('disputed')
    expect(stagedSettlementAgreementStatus(['refunded', 'pending'])).toBe('active')
  })

  it('binds approval to the exact stage, money, contract, and paid lineage', () => {
    expect(stagedSettlementApprovalPayload({
      agreementId: 'agreement-1',
      contractFingerprint: 'f'.repeat(64),
      stageId: 'completion',
      stageOrder: 3,
      amountCents: 5_001,
      currency: 'USD',
      paidPredecessors: [
        { stageId: 'milestone', paymentIntentId: 'pi_2' },
        { stageId: 'commitment', paymentIntentId: 'pi_1' },
      ],
    })).toEqual({
      stagedSettlement: {
        agreementId: 'agreement-1',
        contractFingerprint: 'f'.repeat(64),
        stageId: 'completion',
        stageOrder: 3,
        amountCents: 5_001,
        currency: 'usd',
        paidPredecessors: [
          { stageId: 'commitment', paymentIntentId: 'pi_1' },
          { stageId: 'milestone', paymentIntentId: 'pi_2' },
        ],
      },
    })
  })
})
