export const STAGED_SETTLEMENT_TERMS_VERSION = 1 as const
export const STAGED_SETTLEMENT_SNAPSHOT_VERSION = 1 as const
export const STAGED_SETTLEMENT_ALLOCATION_BPS = 10_000 as const
export const MIN_STAGED_SETTLEMENT_STAGES = 2
export const MAX_STAGED_SETTLEMENT_STAGES = 5

export type StagedSettlementStageKind = 'commitment' | 'milestone' | 'completion'

export type StagedSettlementStage = {
  id: string
  label: string
  kind: StagedSettlementStageKind
  allocationBps: number
}

/**
 * Merchant-authored finite payment schedule. It allocates one authoritative
 * total; it does not create invoices, escrow, recurring charges, or automatic
 * future payments.
 */
export type StagedSettlementTerms = {
  schemaVersion: typeof STAGED_SETTLEMENT_TERMS_VERSION
  paymentModel: 'staged-fixed-total'
  approvalPolicy: 'buyer-approves-each-stage'
  mutationPolicy: 'immutable-after-first-payment'
  stages: StagedSettlementStage[]
}

export type ResolvedStagedSettlementStage = StagedSettlementStage & {
  order: number
  amountCents: number
}

export type StagedSettlementSnapshot = {
  schemaVersion: typeof STAGED_SETTLEMENT_SNAPSHOT_VERSION
  terms: StagedSettlementTerms
  totalAmount: number
  currency: string
  stages: ResolvedStagedSettlementStage[]
}

export type StagedSettlementValidation<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; error: string }

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const STAGE_KINDS = new Set<StagedSettlementStageKind>(['commitment', 'milestone', 'completion'])
const SAFE_TEXT_RE = /^[^\u0000-\u001f\u007f<>]+$/

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(record).every((key) => allowedKeys.has(key))
}

function label(value: unknown, stageId: string): StagedSettlementValidation<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, code: 'staged_settlement_stage_label', error: `Stage ${stageId} needs a buyer-safe label.` }
  }
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length > 120 || !SAFE_TEXT_RE.test(normalized)) {
    return { ok: false, code: 'staged_settlement_stage_label', error: `Stage ${stageId} label must be plain text with at most 120 characters.` }
  }
  return { ok: true, value: normalized }
}

/** Validate and canonicalize a bounded merchant-authored staged schedule. */
export function validateStagedSettlementTerms(value: unknown): StagedSettlementValidation<StagedSettlementTerms> {
  const record = objectRecord(value)
  if (!record || !exactKeys(record, ['schemaVersion', 'paymentModel', 'approvalPolicy', 'mutationPolicy', 'stages'])) {
    return { ok: false, code: 'staged_settlement_terms_shape', error: 'Staged settlement terms must use only the bounded v1 fields.' }
  }
  if (record.schemaVersion !== STAGED_SETTLEMENT_TERMS_VERSION) {
    return { ok: false, code: 'staged_settlement_terms_version', error: 'Unsupported staged settlement terms schema version.' }
  }
  if (record.paymentModel !== 'staged-fixed-total') {
    return { ok: false, code: 'staged_settlement_payment_model', error: 'Staged settlement v1 only allocates one fixed agreed total.' }
  }
  if (record.approvalPolicy !== 'buyer-approves-each-stage') {
    return { ok: false, code: 'staged_settlement_approval_policy', error: 'Every staged settlement payment must require fresh buyer approval.' }
  }
  if (record.mutationPolicy !== 'immutable-after-first-payment') {
    return { ok: false, code: 'staged_settlement_mutation_policy', error: 'A staged settlement agreement must become immutable after its first payment.' }
  }
  if (
    !Array.isArray(record.stages)
    || record.stages.length < MIN_STAGED_SETTLEMENT_STAGES
    || record.stages.length > MAX_STAGED_SETTLEMENT_STAGES
  ) {
    return {
      ok: false,
      code: 'staged_settlement_stage_count',
      error: `Staged settlement needs between ${MIN_STAGED_SETTLEMENT_STAGES} and ${MAX_STAGED_SETTLEMENT_STAGES} stages.`,
    }
  }

  const stages: StagedSettlementStage[] = []
  const seenIds = new Set<string>()
  let totalBps = 0
  let commitmentCount = 0
  let completionCount = 0

  for (const raw of record.stages) {
    const stage = objectRecord(raw)
    if (!stage || !exactKeys(stage, ['id', 'label', 'kind', 'allocationBps'])) {
      return { ok: false, code: 'staged_settlement_stage_shape', error: 'Every staged settlement stage must use only id, label, kind, and allocationBps.' }
    }
    if (typeof stage.id !== 'string' || !KEY_RE.test(stage.id)) {
      return { ok: false, code: 'staged_settlement_stage_id', error: 'Stage IDs must use lowercase letters, numbers, underscores, or hyphens.' }
    }
    if (seenIds.has(stage.id)) {
      return { ok: false, code: 'staged_settlement_stage_id', error: `Duplicate staged settlement stage ID ${JSON.stringify(stage.id)}.` }
    }
    seenIds.add(stage.id)

    const normalizedLabel = label(stage.label, stage.id)
    if (!normalizedLabel.ok) return normalizedLabel
    if (typeof stage.kind !== 'string' || !STAGE_KINDS.has(stage.kind as StagedSettlementStageKind)) {
      return { ok: false, code: 'staged_settlement_stage_kind', error: `Stage ${stage.id} kind must be commitment, milestone, or completion.` }
    }
    if (
      typeof stage.allocationBps !== 'number'
      || !Number.isInteger(stage.allocationBps)
      || stage.allocationBps < 1
      || stage.allocationBps >= STAGED_SETTLEMENT_ALLOCATION_BPS
    ) {
      return { ok: false, code: 'staged_settlement_allocation', error: `Stage ${stage.id} allocationBps must be a whole number between 1 and 9999.` }
    }

    const kind = stage.kind as StagedSettlementStageKind
    if (kind === 'commitment') commitmentCount += 1
    if (kind === 'completion') completionCount += 1
    totalBps += stage.allocationBps
    stages.push({ id: stage.id, label: normalizedLabel.value, kind, allocationBps: stage.allocationBps })
  }

  if (totalBps !== STAGED_SETTLEMENT_ALLOCATION_BPS) {
    return { ok: false, code: 'staged_settlement_allocation_total', error: 'Staged settlement allocations must total exactly 10000 basis points.' }
  }
  if (commitmentCount > 1 || (commitmentCount === 1 && stages[0]?.kind !== 'commitment')) {
    return { ok: false, code: 'staged_settlement_commitment_order', error: 'A schedule may have at most one commitment stage and it must be first.' }
  }
  if (completionCount !== 1 || stages.at(-1)?.kind !== 'completion') {
    return { ok: false, code: 'staged_settlement_completion_order', error: 'A schedule needs exactly one completion stage and it must be last.' }
  }

  return {
    ok: true,
    value: {
      schemaVersion: STAGED_SETTLEMENT_TERMS_VERSION,
      paymentModel: 'staged-fixed-total',
      approvalPolicy: 'buyer-approves-each-stage',
      mutationPolicy: 'immutable-after-first-payment',
      stages,
    },
  }
}

/** Resolve exact smallest-unit stage amounts from one authoritative total. */
export function resolveStagedSettlement(input: {
  terms: StagedSettlementTerms
  totalAmount: number
  currency: string
}): StagedSettlementValidation<StagedSettlementSnapshot> {
  const validated = validateStagedSettlementTerms(input.terms)
  if (!validated.ok) return validated
  if (!Number.isSafeInteger(input.totalAmount) || input.totalAmount <= 0) {
    return { ok: false, code: 'staged_settlement_total', error: 'Staged settlement requires a positive total in currency smallest units.' }
  }
  const currency = input.currency.trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(currency)) {
    return { ok: false, code: 'staged_settlement_currency', error: 'Staged settlement requires a normalized three-letter currency.' }
  }

  let allocated = 0
  const lastIndex = validated.value.stages.length - 1
  const stages = validated.value.stages.map((stage, index): ResolvedStagedSettlementStage => {
    const amountCents = index === lastIndex
      ? input.totalAmount - allocated
      : Math.floor((input.totalAmount * stage.allocationBps) / STAGED_SETTLEMENT_ALLOCATION_BPS)
    allocated += amountCents
    return { ...stage, order: index + 1, amountCents }
  })
  if (stages.some((stage) => stage.amountCents <= 0)) {
    return { ok: false, code: 'staged_settlement_stage_amount', error: 'The agreed total is too small to allocate a positive amount to every stage.' }
  }

  return {
    ok: true,
    value: {
      schemaVersion: STAGED_SETTLEMENT_SNAPSHOT_VERSION,
      terms: validated.value,
      totalAmount: input.totalAmount,
      currency,
      stages,
    },
  }
}
