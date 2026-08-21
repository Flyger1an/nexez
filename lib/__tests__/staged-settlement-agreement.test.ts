import { describe, expect, it } from 'vitest'
import {
  stagedSettlementContractFingerprint,
  stagedSettlementStripeMetadata,
  validStagedSettlementAccessToken,
} from '../server/staged-settlement-agreement'
import type { StagedSettlementAgreementSnapshot } from '../staged-settlement-runtime'

const snapshot: StagedSettlementAgreementSnapshot = {
  schemaVersion: 1,
  settlement: {
    schemaVersion: 1,
    totalAmount: 10_000,
    currency: 'usd',
    terms: {
      schemaVersion: 1,
      paymentModel: 'staged-fixed-total',
      approvalPolicy: 'buyer-approves-each-stage',
      mutationPolicy: 'immutable-after-first-payment',
      stages: [
        { id: 'deposit', label: 'Deposit', kind: 'commitment', allocationBps: 3000 },
        { id: 'completion', label: 'Completion', kind: 'completion', allocationBps: 7000 },
      ],
    },
    stages: [
      { id: 'deposit', label: 'Deposit', kind: 'commitment', allocationBps: 3000, order: 1, amountCents: 3000 },
      { id: 'completion', label: 'Completion', kind: 'completion', allocationBps: 7000, order: 2, amountCents: 7000 },
    ],
  },
  offerConfiguration: {},
  pricingFingerprint: null,
  fulfillmentFingerprint: null,
}

describe('staged settlement agreement persistence contract', () => {
  it('fingerprints the exact immutable snapshot', () => {
    const fingerprint = stagedSettlementContractFingerprint(snapshot)
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(stagedSettlementContractFingerprint({
      ...snapshot,
      settlement: { ...snapshot.settlement, totalAmount: 10_001 },
    })).not.toBe(fingerprint)
  })

  it('puts only identifiers and fingerprints in Stripe metadata', () => {
    expect(stagedSettlementStripeMetadata({
      agreementId: 'agreement-1',
      obligationId: 'obligation-1',
      stageId: 'deposit',
      contractFingerprint: 'a'.repeat(64),
      approvalFingerprint: 'b'.repeat(64),
      ownerId: 'owner-1',
      pageId: 'page-1',
      offerKey: 'services:0',
    })).toEqual({
      nexez_kind: 'staged_settlement',
      nexez_staged_settlement_id: 'agreement-1',
      nexez_staged_obligation_id: 'obligation-1',
      nexez_staged_stage_id: 'deposit',
      nexez_staged_contract_fingerprint: 'a'.repeat(64),
      nexez_staged_approval_fingerprint: 'b'.repeat(64),
      nexez_owner_id: 'owner-1',
      nexez_page_id: 'page-1',
      nexez_offer_key: 'services:0',
    })
  })

  it('accepts only full bearer credentials before hashing them', () => {
    expect(validStagedSettlementAccessToken('f'.repeat(64))).toMatch(/^[a-f0-9]{64}$/)
    expect(validStagedSettlementAccessToken('short')).toBeNull()
    expect(validStagedSettlementAccessToken('g'.repeat(64))).toBeNull()
  })
})
