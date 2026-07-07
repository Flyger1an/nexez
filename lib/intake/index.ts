// Seller intake interview — platform capability (spec: nexez-intake-interview-spec.md).
// Pure state machine + deterministic gap analysis. Consumed by the threads API
// (web /create + seller mobile are thin clients of that API — no interview
// logic ever lives in components).
export * from './types'
export { analyzeGaps, hasBlockingGaps, isVaguePrice, offerEntries } from './gaps'
export {
  applyIntakeAction,
  createIntakeState,
  emptyIntakeDraft,
  handoffEligible,
  normalizeOfferName,
} from './reducer'
