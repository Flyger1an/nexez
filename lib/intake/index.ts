// Seller intake interview - platform capability (spec: nexez-intake-interview-spec.md).
// The reducer remains pure and authoritative; Commerce Template intelligence is
// composed around its gap projection here so web + mobile consume one behavior.
import { applyCommerceAwareIntakeAction } from './commerce'
import { applyIntakeAction as applyBaseIntakeAction } from './reducer'
import type { IntakeAction, IntakeApplyResult, IntakeEntitlementPolicy, IntakeState } from './types'

export * from './types'
export { analyzeIntakeGaps as analyzeGaps, mergeCommerceTemplateGaps } from './commerce'
export { hasBlockingGaps, isVaguePrice, offerEntries } from './gaps'
export {
  createIntakeState,
  emptyIntakeDraft,
  handoffEligible,
  normalizeOfferName,
} from './reducer'
export {
  hasNegotiationConfiguration,
  normalizeIntakeDraftNegotiation,
  sameNegotiationConfiguration,
  unauthorizedNegotiationMutation,
} from './negotiation-policy'

export function applyIntakeAction(
  state: IntakeState,
  action: IntakeAction,
  policy?: IntakeEntitlementPolicy,
): IntakeApplyResult {
  return applyCommerceAwareIntakeAction(applyBaseIntakeAction, state, action, policy)
}
