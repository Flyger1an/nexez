import {
  preflightCommerceBuyerClaims,
  type CommerceBuyerClaim,
  type CommerceBuyerEvidence,
  type CommerceBuyerPreflightClaimResult,
} from './buyer-preflight'
import type { CommerceTemplate } from './schema'

export type CommerceBuyerReferenceNextStep =
  | 'ask-buyer'
  | 'read-merchant-manifest'
  | 'dry-run-checkout'
  | 'check-published-availability'

export type CommerceBuyerReferenceBlockedClaim = {
  claim: CommerceBuyerClaim
  diagnostics: CommerceBuyerPreflightClaimResult['diagnostics']
  nextStep: CommerceBuyerReferenceNextStep
}

export type CommerceBuyerReferenceDecision = {
  status: 'ready' | 'needs-information'
  assertions: CommerceBuyerClaim[]
  blockedClaims: CommerceBuyerReferenceBlockedClaim[]
}

function nextStepFor(claim: CommerceBuyerClaim): CommerceBuyerReferenceNextStep {
  switch (claim.kind) {
    case 'buyer-context':
      return 'ask-buyer'
    case 'merchant-fact':
      return 'read-merchant-manifest'
    case 'price':
      return 'dry-run-checkout'
    case 'availability':
      return 'check-published-availability'
  }
}

/**
 * Nexez reference-buyer decision seam for factual assertions.
 *
 * Only claims accepted by the production provenance preflight may appear in
 * `assertions`. Rejected claims are withheld and converted into deterministic
 * next steps instead of being guessed into a buyer-facing answer or action.
 *
 * Evidence passed here is expected to come from independent readers of the
 * buyer request, merchant manifest, checkout dry-run, or published availability.
 * This function does not authenticate arbitrary third-party evidence objects and
 * does not claim to govern models or agents that bypass this Nexez reference seam.
 */
export function decideCommerceBuyerClaims(
  template: CommerceTemplate,
  proposedClaims: CommerceBuyerClaim[],
  evidence: CommerceBuyerEvidence[],
): CommerceBuyerReferenceDecision {
  const preflight = preflightCommerceBuyerClaims(template, proposedClaims, evidence)
  const assertions: CommerceBuyerClaim[] = []
  const blockedClaims: CommerceBuyerReferenceBlockedClaim[] = []

  for (const result of preflight.claims) {
    if (result.status === 'accepted') {
      assertions.push(result.claim)
      continue
    }

    blockedClaims.push({
      claim: result.claim,
      diagnostics: result.diagnostics,
      nextStep: nextStepFor(result.claim),
    })
  }

  return {
    status: blockedClaims.length === 0 ? 'ready' : 'needs-information',
    assertions,
    blockedClaims,
  }
}
