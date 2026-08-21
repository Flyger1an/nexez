import { describe, expect, it } from 'vitest'
import {
  resolveStagedSettlement,
  validateStagedSettlementTerms,
  type StagedSettlementTerms,
} from '../staged-settlement'

const terms: StagedSettlementTerms = {
  schemaVersion: 1,
  paymentModel: 'staged-fixed-total',
  approvalPolicy: 'buyer-approves-each-stage',
  mutationPolicy: 'immutable-after-first-payment',
  stages: [
    { id: 'booking', label: 'Booking installment', kind: 'commitment', allocationBps: 2500 },
    { id: 'design', label: 'Design approval', kind: 'milestone', allocationBps: 3500 },
    { id: 'launch', label: 'Launch and handoff', kind: 'completion', allocationBps: 4000 },
  ],
}

describe('staged settlement contract', () => {
  it('validates and canonicalizes a bounded merchant schedule', () => {
    expect(validateStagedSettlementTerms({
      ...terms,
      stages: terms.stages.map((stage) => ({ ...stage, label: `  ${stage.label}  ` })),
    })).toEqual({ ok: true, value: terms })
  })

  it('rejects duplicate IDs, unsafe labels, unbounded shapes, and invalid ordering', () => {
    expect(validateStagedSettlementTerms({ ...terms, arbitraryCode: 'chargeBuyer()' })).toMatchObject({ ok: false, code: 'staged_settlement_terms_shape' })
    expect(validateStagedSettlementTerms({
      ...terms,
      stages: [terms.stages[0], { ...terms.stages[1], id: 'booking' }, terms.stages[2]],
    })).toMatchObject({ ok: false, code: 'staged_settlement_stage_id' })
    expect(validateStagedSettlementTerms({
      ...terms,
      stages: [terms.stages[0], { ...terms.stages[1], label: '<script>pay()</script>' }, terms.stages[2]],
    })).toMatchObject({ ok: false, code: 'staged_settlement_stage_label' })
    expect(validateStagedSettlementTerms({
      ...terms,
      stages: [terms.stages[0], { ...terms.stages[1], kind: 'completion' }, { ...terms.stages[2], kind: 'milestone' }],
    })).toMatchObject({ ok: false, code: 'staged_settlement_completion_order' })
  })

  it('requires positive allocations totaling exactly 10000 basis points', () => {
    expect(validateStagedSettlementTerms({
      ...terms,
      stages: terms.stages.map((stage, index) => index === 0 ? { ...stage, allocationBps: 2499 } : stage),
    })).toMatchObject({ ok: false, code: 'staged_settlement_allocation_total' })
    expect(validateStagedSettlementTerms({
      ...terms,
      stages: terms.stages.map((stage, index) => index === 0 ? { ...stage, allocationBps: 0 } : stage),
    })).toMatchObject({ ok: false, code: 'staged_settlement_allocation' })
  })

  it('allocates exact smallest-unit amounts and assigns rounding remainder to completion', () => {
    const resolved = resolveStagedSettlement({ terms, totalAmount: 10_001, currency: 'USD' })
    expect(resolved).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        terms,
        totalAmount: 10_001,
        currency: 'usd',
        stages: [
          { ...terms.stages[0], order: 1, amountCents: 2500 },
          { ...terms.stages[1], order: 2, amountCents: 3500 },
          { ...terms.stages[2], order: 3, amountCents: 4001 },
        ],
      },
    })
  })

  it('fails closed when the total cannot fund every stage', () => {
    expect(resolveStagedSettlement({ terms, totalAmount: 2, currency: 'usd' }))
      .toMatchObject({ ok: false, code: 'staged_settlement_stage_amount' })
  })
})
