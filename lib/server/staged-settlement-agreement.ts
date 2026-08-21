import 'server-only'
import { actionRequestHash } from '../action-approval'
import type { StagedSettlementAgreementSnapshot } from '../staged-settlement-runtime'
import {
  bearerTokenColumns,
  canEncryptBearerTokens,
  hashBearerToken,
  mintBearerToken,
} from './bearer-token'

export const STRIPE_STAGED_SETTLEMENT_KIND = 'staged_settlement' as const

export type StagedSettlementAgreementIdentity = {
  id: string
  status: string
  contractFingerprint: string
  connectAccountId: string
}

export function stagedSettlementContractFingerprint(snapshot: StagedSettlementAgreementSnapshot) {
  return actionRequestHash('checkout', { stagedSettlementAgreement: snapshot })
}

export function stagedSettlementStripeMetadata(input: {
  agreementId: string
  obligationId: string
  stageId: string
  contractFingerprint: string
  approvalFingerprint: string
  ownerId: string
  pageId?: string | null
  offerKey: string
}): Record<string, string> {
  return {
    nexez_kind: STRIPE_STAGED_SETTLEMENT_KIND,
    nexez_staged_settlement_id: input.agreementId,
    nexez_staged_obligation_id: input.obligationId,
    nexez_staged_stage_id: input.stageId,
    nexez_staged_contract_fingerprint: input.contractFingerprint,
    nexez_staged_approval_fingerprint: input.approvalFingerprint,
    nexez_owner_id: input.ownerId,
    ...(input.pageId ? { nexez_page_id: input.pageId } : {}),
    nexez_offer_key: input.offerKey,
  }
}

export async function findIdempotentStagedSettlementAgreement(input: {
  admin: { from: (table: string) => any }
  ownerId: string
  requestIdempotencyKey: string | null | undefined
}): Promise<StagedSettlementAgreementIdentity | null> {
  if (!input.requestIdempotencyKey) return null
  const { data } = await input.admin
    .from('staged_settlement_agreements')
    .select('id, status, contract_fingerprint, stripe_connect_account_id')
    .eq('owner_id', input.ownerId)
    .eq('request_idempotency_key', input.requestIdempotencyKey)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    status: data.status,
    contractFingerprint: data.contract_fingerprint,
    connectAccountId: data.stripe_connect_account_id,
  }
}

export async function createPendingStagedSettlementAgreement(input: {
  admin: { from: (table: string) => any }
  id: string
  ownerId: string
  pageId?: string | null
  slug?: string | null
  offerKey: string
  offerName: string
  connectAccountId: string
  snapshot: StagedSettlementAgreementSnapshot
  contractFingerprint: string
  firstApprovalFingerprint: string
  requestIdempotencyKey?: string | null
  commissionBps?: number | null
  planId?: string | null
  commissionSource?: string | null
  buyerEmail?: string | null
  buyerName?: string | null
  buyerReference?: string | null
  buyerAgent?: string | null
}): Promise<
  | { ok: true; accessToken: string; firstObligationId: string }
  | { ok: false; error: string; conflict?: boolean }
> {
  if (!canEncryptBearerTokens()) {
    return {
      ok: false,
      error: 'Staged settlement requires INTEGRATION_SECRET_KEY so later buyer approvals remain recoverable.',
    }
  }
  const accessToken = mintBearerToken()
  const tokenColumns = bearerTokenColumns(accessToken, 'access_token')
  if (!tokenColumns.access_token_encrypted) {
    return { ok: false, error: 'Could not encrypt the staged settlement management credential.' }
  }
  const parent = await input.admin.from('staged_settlement_agreements').insert({
    id: input.id,
    owner_id: input.ownerId,
    page_id: input.pageId ?? null,
    slug: input.slug ?? null,
    offer_key: input.offerKey,
    offer_name: input.offerName,
    status: 'pending',
    contract_snapshot: input.snapshot,
    contract_fingerprint: input.contractFingerprint,
    total_amount_cents: input.snapshot.settlement.totalAmount,
    currency: input.snapshot.settlement.currency,
    stripe_connect_account_id: input.connectAccountId,
    request_idempotency_key: input.requestIdempotencyKey ?? null,
    commission_bps: input.commissionBps ?? null,
    plan_id_at_purchase: input.planId ?? null,
    commission_source: input.commissionSource ?? null,
    buyer_email: input.buyerEmail ?? null,
    buyer_name: input.buyerName ?? null,
    buyer_reference: input.buyerReference ?? null,
    buyer_agent: input.buyerAgent ?? null,
    ...tokenColumns,
  })
  if (parent.error) {
    return { ok: false, error: parent.error.message, conflict: parent.error.code === '23505' }
  }

  const obligations = input.snapshot.settlement.stages.map((stage, index) => ({
    agreement_id: input.id,
    stage_id: stage.id,
    stage_order: stage.order,
    label: stage.label,
    kind: stage.kind,
    allocation_bps: stage.allocationBps,
    amount_cents: stage.amountCents,
    status: index === 0 ? 'payment_pending' : 'pending',
    approval_fingerprint: index === 0 ? input.firstApprovalFingerprint : null,
  }))
  const children = await input.admin
    .from('staged_settlement_obligations')
    .insert(obligations)
    .select('id, stage_order')
  const first = (children.data ?? []).find((row: { stage_order: number }) => row.stage_order === 1)
  if (children.error || !first?.id) {
    await input.admin.from('staged_settlement_agreements').delete().eq('id', input.id).eq('status', 'pending')
    return { ok: false, error: children.error?.message ?? 'The first staged obligation was not created.' }
  }
  return { ok: true, accessToken, firstObligationId: first.id }
}

export async function attachStagedSettlementCheckoutSession(input: {
  admin: { from: (table: string) => any }
  agreementId: string
  obligationId: string
  stripeSessionId: string
  applicationFeeCents: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await input.admin
    .from('staged_settlement_obligations')
    .update({
      stripe_checkout_session_id: input.stripeSessionId,
      application_fee_cents: input.applicationFeeCents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.obligationId)
    .eq('agreement_id', input.agreementId)
    .eq('status', 'payment_pending')
    .is('stripe_checkout_session_id', null)
    .select('id')
    .maybeSingle()
  if (error || !data) return { ok: false, error: error?.message ?? 'The obligation is no longer payable.' }
  return { ok: true }
}

export async function claimStagedSettlementObligation(input: {
  admin: { from: (table: string) => any }
  agreementId: string
  obligationId: string
  approvalFingerprint: string
}) {
  const { data, error } = await input.admin
    .from('staged_settlement_obligations')
    .update({
      status: 'payment_pending',
      approval_fingerprint: input.approvalFingerprint,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.obligationId)
    .eq('agreement_id', input.agreementId)
    .eq('status', 'ready_for_buyer_approval')
    .select('id')
    .maybeSingle()
  return error || !data
    ? { ok: false as const, error: error?.message ?? 'The obligation is no longer awaiting buyer approval.' }
    : { ok: true as const }
}

export async function resetUnfundedStagedSettlementObligation(input: {
  admin: { from: (table: string) => any }
  agreementId: string
  obligationId: string
}) {
  await input.admin
    .from('staged_settlement_obligations')
    .update({
      status: 'ready_for_buyer_approval',
      approval_fingerprint: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.obligationId)
    .eq('agreement_id', input.agreementId)
    .eq('status', 'payment_pending')
    .is('stripe_checkout_session_id', null)
}

export async function deleteUnfundedStagedSettlementAgreement(
  admin: { from: (table: string) => any },
  agreementId: string,
) {
  await admin.from('staged_settlement_agreements').delete().eq('id', agreementId).eq('status', 'pending')
}

export function validStagedSettlementAccessToken(token: string | null | undefined) {
  const clean = (token ?? '').trim()
  if (!/^[a-f0-9]{64}$/.test(clean)) return null
  return hashBearerToken(clean)
}
