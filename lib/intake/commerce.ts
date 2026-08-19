import { getCommerceTemplateGapCandidates } from '../commerce-templates/intake'
import { analyzeGaps as analyzeBaseGaps } from './gaps'
import type { Gap, IntakeAction, IntakeApplyResult, IntakeState } from './types'

const ANALYZED_PHASES = new Set<IntakeState['phase']>(['GAP_ANALYSIS', 'INTERVIEW', 'SYNTHESIS'])
const MAX_TEMPLATE_GAPS_PER_ANALYSIS = 5

/**
 * Merge template-derived knowledge questions into the existing deterministic
 * gap set without changing the base gap engine or introducing new blockers.
 * Existing hard-coded industry expectations win shared semantic slots during
 * the migration, so the rollout is additive and regression-friendly.
 */
export function mergeCommerceTemplateGaps(
  baseGaps: Gap[],
  state: Pick<IntakeState, 'draft' | 'answers' | 'templateHint'>,
): Gap[] {
  if (!state.draft.industry.trim() && !state.templateHint) return baseGaps

  const answeredIds = new Set(state.answers.filter((answer) => !answer.skipped).map((answer) => answer.gapId))
  const skippedIds = new Set(state.answers.filter((answer) => answer.skipped).map((answer) => answer.gapId))
  const seenIds = new Set(baseGaps.map((gap) => gap.id))
  const seenKnowledgeSlots = new Set(
    baseGaps
      .filter((gap) => gap.id.startsWith('ind:'))
      .map((gap) => `knowledge:${gap.field}`),
  )

  const merged = [...baseGaps]
  let addedTemplateGaps = 0
  for (const candidate of getCommerceTemplateGapCandidates(
    { draft: state.draft, templateHint: state.templateHint },
    { maxCandidates: MAX_TEMPLATE_GAPS_PER_ANALYSIS + seenKnowledgeSlots.size },
  )) {
    if (seenIds.has(candidate.gap.id)) continue
    if (skippedIds.has(candidate.gap.id) || (candidate.oneShot && answeredIds.has(candidate.gap.id))) continue
    if (seenKnowledgeSlots.has(candidate.dedupKey)) continue

    seenIds.add(candidate.gap.id)
    seenKnowledgeSlots.add(candidate.dedupKey)
    merged.push(candidate.gap)
    addedTemplateGaps += 1
    if (addedTemplateGaps >= MAX_TEMPLATE_GAPS_PER_ANALYSIS) break
  }

  return merged.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}

export function analyzeIntakeGaps(
  state: Pick<IntakeState, 'draft' | 'extractions' | 'answers' | 'templateHint'>,
): Gap[] {
  return mergeCommerceTemplateGaps(analyzeBaseGaps(state), state)
}

/**
 * Thin orchestration wrapper around the existing pure reducer. The reducer
 * remains the authority for phase validation, provenance, offer invention
 * rejection, and handoff rules; this layer only refreshes its askable `gaps`
 * projection with template intelligence after successful analyzed-phase turns.
 */
export function applyCommerceAwareIntakeAction(
  baseApply: (state: IntakeState, action: IntakeAction) => IntakeApplyResult,
  state: IntakeState,
  action: IntakeAction,
): IntakeApplyResult {
  const applied = baseApply(state, action)
  if (!applied.ok) return applied
  if (!ANALYZED_PHASES.has(applied.state.phase)) return applied

  return {
    ok: true,
    state: {
      ...applied.state,
      gaps: analyzeIntakeGaps(applied.state),
    },
  }
}
