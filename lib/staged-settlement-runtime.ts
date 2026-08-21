import {
  resolveStagedSettlement,
  type StagedSettlementTerms,
  type StagedSettlementSnapshot,
  type StagedSettlementValidation,
} from './staged-settlement'

export const STAGED_SETTLEMENT_AGREEMENT_SNAPSHOT_VERSION = 1 as const

export type StagedSettlementAgreementStatus =
  | 'pending'
  | 'active'
  | 'complete'
  | 'cancelled'
  | 'disputed'

export type StagedSettlementObligationStatus =
  | 'pending'
  | 'ready_for_buyer_approval'
  | 'payment_pending'
  | 'paid'
  | 'refunded'
  | 'disputed'
  | 'cancelled'

export type StagedSettlementAgreementSnapshot = {
  schemaVersion: typeof STAGED_SETTLEMENT_AGREEMENT_SNAPSHOT_VERSION
  settlement: StagedSettlementSnapshot
  offerConfiguration: Record<string, unknown>
  pricingFingerprint: string | null
  fulfillmentFingerprint: string | null
}

export function buildStagedSettlementAgreementSnapshot(input: {
  terms: StagedSettlementTerms
  totalAmount: number
  currency: string
  offerConfiguration?: Record<string, unknown>
  pricingFingerprint?: string | null
  fulfillmentFingerprint?: string | null
}): StagedSettlementValidation<StagedSettlementAgreementSnapshot> {
  const settlement = resolveStagedSettlement({
    terms: input.terms,
    totalAmount: input.totalAmount,
    currency: input.currency,
  })
  if (!settlement.ok) return settlement
  return {
    ok: true,
    value: {
      schemaVersion: STAGED_SETTLEMENT_AGREEMENT_SNAPSHOT_VERSION,
      settlement: settlement.value,
      offerConfiguration: { ...(input.offerConfiguration ?? {}) },
      pricingFingerprint: input.pricingFingerprint ?? null,
      fulfillmentFingerprint: input.fulfillmentFingerprint ?? null,
    },
  }
}

export type StagedSettlementPaidPredecessor = {
  stageId: string
  paymentIntentId: string
}

export type StagedSettlementApprovalPayload = {
  stagedSettlement: {
    agreementId: string
    contractFingerprint: string
    stageId: string
    stageOrder: number
    amountCents: number
    currency: string
    paidPredecessors: StagedSettlementPaidPredecessor[]
  }
}

const TRANSITIONS: Record<StagedSettlementObligationStatus, ReadonlySet<StagedSettlementObligationStatus>> = {
  pending: new Set(['ready_for_buyer_approval', 'cancelled']),
  ready_for_buyer_approval: new Set(['payment_pending', 'cancelled']),
  payment_pending: new Set(['ready_for_buyer_approval', 'paid', 'cancelled']),
  paid: new Set(['refunded', 'disputed']),
  refunded: new Set(),
  disputed: new Set(['paid', 'refunded']),
  cancelled: new Set(),
}

export function canTransitionStagedSettlementObligation(
  from: StagedSettlementObligationStatus,
  to: StagedSettlementObligationStatus,
) {
  return TRANSITIONS[from].has(to)
}

export function stagedSettlementAgreementStatus(
  statuses: readonly StagedSettlementObligationStatus[],
): StagedSettlementAgreementStatus {
  if (statuses.some((status) => status === 'disputed')) return 'disputed'
  if (statuses.length > 0 && statuses.every((status) => status === 'paid')) return 'complete'
  if (statuses.some((status) => status === 'paid' || status === 'refunded')) return 'active'
  return 'pending'
}

export function canReadyStagedSettlementObligation(input: {
  stageOrder: number
  obligations: ReadonlyArray<{ stageOrder: number; status: StagedSettlementObligationStatus }>
}) {
  if (!Number.isInteger(input.stageOrder) || input.stageOrder < 1) return false
  const target = input.obligations.find((item) => item.stageOrder === input.stageOrder)
  if (!target || target.status !== 'pending') return false
  if (input.obligations.some((item) =>
    item.stageOrder !== input.stageOrder
    && (item.status === 'ready_for_buyer_approval' || item.status === 'payment_pending')
  )) return false
  return input.obligations
    .filter((item) => item.stageOrder < input.stageOrder)
    .every((item) => item.status === 'paid')
}

export function stagedSettlementApprovalPayload(input: {
  agreementId: string
  contractFingerprint: string
  stageId: string
  stageOrder: number
  amountCents: number
  currency: string
  paidPredecessors: StagedSettlementPaidPredecessor[]
}): StagedSettlementApprovalPayload {
  return {
    stagedSettlement: {
      agreementId: input.agreementId,
      contractFingerprint: input.contractFingerprint,
      stageId: input.stageId,
      stageOrder: input.stageOrder,
      amountCents: input.amountCents,
      currency: input.currency.toLowerCase(),
      paidPredecessors: [...input.paidPredecessors]
        .sort((left, right) => left.stageId.localeCompare(right.stageId))
        .map((item) => ({ ...item })),
    },
  }
}
