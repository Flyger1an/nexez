import type { CommerceTemplate } from './schema'

export type CommerceBuyerTruthValue =
  | string
  | number
  | boolean
  | null
  | CommerceBuyerTruthValue[]
  | { [key: string]: CommerceBuyerTruthValue }

export type CommerceBuyerEvidenceSource =
  | 'buyer-request'
  | 'merchant-manifest'
  | 'checkout-dry-run'
  | 'published-availability'

export type CommerceBuyerClaimKind =
  | 'buyer-context'
  | 'merchant-fact'
  | 'price'
  | 'availability'

export type CommerceBuyerEvidence = {
  id: string
  source: CommerceBuyerEvidenceSource
  factKey: string
  value: CommerceBuyerTruthValue
}

export type CommerceBuyerClaim = {
  id: string
  kind: CommerceBuyerClaimKind
  factKey: string
  value: CommerceBuyerTruthValue
  /** Independent evidence ids that support this exact assertion. */
  evidenceIds: string[]
}

export type CommerceBuyerPreflightDiagnosticCode =
  | 'duplicate_claim_id'
  | 'duplicate_evidence_id'
  | 'unknown_fact'
  | 'missing_evidence'
  | 'unknown_evidence'
  | 'evidence_fact_mismatch'
  | 'evidence_source_mismatch'
  | 'evidence_value_mismatch'

export type CommerceBuyerPreflightDiagnostic = {
  code: CommerceBuyerPreflightDiagnosticCode
  claimId: string
  factKey: string
  evidenceId?: string
  message: string
}

export type CommerceBuyerPreflightClaimResult = {
  claim: CommerceBuyerClaim
  status: 'accepted' | 'rejected'
  diagnostics: CommerceBuyerPreflightDiagnostic[]
}

export type CommerceBuyerPreflightResult = {
  ok: boolean
  claims: CommerceBuyerPreflightClaimResult[]
}

const ALLOWED_SOURCES: Record<CommerceBuyerClaimKind, readonly CommerceBuyerEvidenceSource[]> = {
  'buyer-context': ['buyer-request'],
  'merchant-fact': ['merchant-manifest'],
  price: ['merchant-manifest', 'checkout-dry-run'],
  availability: ['published-availability'],
}

function duplicateIds(values: string[]): Set<string> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return duplicates
}

function canonical(value: CommerceBuyerTruthValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`
}

function diagnostic(
  claim: CommerceBuyerClaim,
  code: CommerceBuyerPreflightDiagnosticCode,
  message: string,
  evidenceId?: string,
): CommerceBuyerPreflightDiagnostic {
  return {
    code,
    claimId: claim.id,
    factKey: claim.factKey,
    ...(evidenceId ? { evidenceId } : {}),
    message,
  }
}

/**
 * Deterministic reference-agent safety preflight for buyer-facing assertions.
 *
 * Nexez can certify only claims grounded in evidence it can name independently:
 * buyer-request context, merchant-published truth, checkout dry-run pricing, or
 * published availability. A claim is rejected when its cited evidence is absent,
 * points at another fact, comes from a source that cannot establish the claim
 * kind, or disagrees with the asserted value.
 *
 * This does not claim control over third-party LLM behavior. It is the production
 * preflight primitive Nexez reference agents and evaluations can use before
 * presenting a fact as true or building an action on top of it.
 */
export function preflightCommerceBuyerClaims(
  template: CommerceTemplate,
  claims: CommerceBuyerClaim[],
  evidence: CommerceBuyerEvidence[],
): CommerceBuyerPreflightResult {
  const factKeys = new Set(
    [...template.requiredFacts, ...template.qualityFacts, ...template.opportunityFacts]
      .map((fact) => fact.key),
  )
  const duplicateClaimIds = duplicateIds(claims.map((claim) => claim.id))
  const duplicateEvidenceIds = duplicateIds(evidence.map((item) => item.id))
  const evidenceById = new Map(evidence.map((item) => [item.id, item] as const))

  const results = claims.map((claim): CommerceBuyerPreflightClaimResult => {
    const diagnostics: CommerceBuyerPreflightDiagnostic[] = []

    if (duplicateClaimIds.has(claim.id)) {
      diagnostics.push(diagnostic(claim, 'duplicate_claim_id', `Claim id ${claim.id} is not unique.`))
    }
    if (!factKeys.has(claim.factKey)) {
      diagnostics.push(
        diagnostic(
          claim,
          'unknown_fact',
          `Claim ${claim.id} references undeclared fact ${claim.factKey} on ${template.id}@${template.version}.`,
        ),
      )
    }
    if (claim.evidenceIds.length === 0) {
      diagnostics.push(
        diagnostic(claim, 'missing_evidence', `Claim ${claim.id} has no independent supporting evidence.`),
      )
    }

    for (const evidenceId of claim.evidenceIds) {
      if (duplicateEvidenceIds.has(evidenceId)) {
        diagnostics.push(
          diagnostic(claim, 'duplicate_evidence_id', `Evidence id ${evidenceId} is ambiguous.`, evidenceId),
        )
        continue
      }

      const item = evidenceById.get(evidenceId)
      if (!item) {
        diagnostics.push(
          diagnostic(claim, 'unknown_evidence', `Claim ${claim.id} cites missing evidence ${evidenceId}.`, evidenceId),
        )
        continue
      }
      if (item.factKey !== claim.factKey) {
        diagnostics.push(
          diagnostic(
            claim,
            'evidence_fact_mismatch',
            `Evidence ${evidenceId} proves ${item.factKey}, not ${claim.factKey}.`,
            evidenceId,
          ),
        )
      }
      if (!ALLOWED_SOURCES[claim.kind].includes(item.source)) {
        diagnostics.push(
          diagnostic(
            claim,
            'evidence_source_mismatch',
            `Evidence source ${item.source} cannot establish a ${claim.kind} claim.`,
            evidenceId,
          ),
        )
      }
      if (canonical(item.value) !== canonical(claim.value)) {
        diagnostics.push(
          diagnostic(
            claim,
            'evidence_value_mismatch',
            `Evidence ${evidenceId} does not support the asserted value for ${claim.factKey}.`,
            evidenceId,
          ),
        )
      }
    }

    return {
      claim: {
        ...claim,
        evidenceIds: [...claim.evidenceIds],
      },
      status: diagnostics.length === 0 ? 'accepted' : 'rejected',
      diagnostics,
    }
  })

  return {
    ok: results.every((result) => result.status === 'accepted'),
    claims: results,
  }
}
