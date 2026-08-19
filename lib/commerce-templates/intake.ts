import type { Gap, GapKind, IntakeDraft, IntakeState } from '../intake/types'
import { resolveCommerceTemplateIntelligence } from './intelligence'
import { commerceTemplates, getCommerceTemplate } from './registry'
import type { CommerceFact, CommerceTemplate } from './schema'
import type { CommerceTemplateMatch } from './matcher'

export type CommerceTemplateGapCandidate = {
  gap: Gap
  dedupKey: string
  /** V1 template gaps are coverage-based: they retire only when the supported
   * structured destination is filled (or the merchant explicitly skips). */
  oneShot: false
  templateId: string
  templateVersion: number
  factKey: string
}

export type CommerceIntakeTemplateContext = {
  matches: CommerceTemplateMatch[]
  candidates: CommerceTemplateGapCandidate[]
}

const CURRENT_ENGINE_OWNS_FACTS = new Set([
  'price',
  'price-logic',
  'price-model',
  'duration',
  'coverage-duration',
])

/**
 * Only facts with a neutral, honest destination in the CURRENT intake
 * field-update grammar are askable in V1. Richer template facts remain in the
 * registry and eval corpus until the Commerce Schema gives them first-class
 * storage.
 *
 * `offer_rules` is deliberately excluded here. Today the reducer treats a
 * rules update on an untyped offer as evidence that the offer is negotiable;
 * reusing that storage for a generic notice-policy answer could silently alter
 * commerce posture. Template intelligence must never create that side effect.
 */
const MATERIALIZABLE_FACT_FIELDS: Record<string, string> = {
  'service-area': 'offer.serviceArea',
  'travel-fee': 'offer.travelFee',
}

function offerEntries(draft: IntakeDraft) {
  return [...draft.services, ...draft.products]
}

function normalizeIndustry(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * Resolve which template definitions are allowed to inform this interview.
 *
 * An owner-selected template hint is knowledge context, never a page fact. It
 * may guide a scratch interview while industry is still unknown. The moment a
 * non-empty merchant/imported industry conflicts with the hinted template,
 * that real draft fact wins and the hint becomes inert. We then fall back to
 * the normal exact-industry pilot matching path.
 */
function eligibleTemplatesForState(
  state: Pick<IntakeState, 'draft' | 'templateHint'>,
): { templates: CommerceTemplate[]; matchingIndustry: string } {
  const industry = normalizeIndustry(state.draft.industry)
  const hinted = state.templateHint ? getCommerceTemplate(state.templateHint) : null
  const activeHint = hinted?.status === 'active' ? hinted : null

  if (activeHint && (!industry || normalizeIndustry(activeHint.industry) === industry)) {
    return {
      templates: [activeHint],
      // Matching-only context: this makes the owner-selected definition rank
      // deterministically without ever copying its industry into the draft.
      matchingIndustry: state.draft.industry.trim() || activeHint.industry,
    }
  }

  if (!industry) return { templates: [], matchingIndustry: '' }

  return {
    templates: commerceTemplates.filter(
      (template) => template.status === 'active' && normalizeIndustry(template.industry) === industry,
    ),
    matchingIndustry: state.draft.industry,
  }
}

function factKind(fact: CommerceFact): GapKind {
  // V1 safety boundary: commerce-template knowledge may improve the interview,
  // but it must not create new publication blockers. Existing hard blockers
  // remain authoritative until each new primitive has proven transaction value.
  return fact.importance === 'opportunity' ? 'opportunity' : 'quality'
}

function factAlreadyCovered(fact: CommerceFact, draft: IntakeDraft): boolean {
  const offers = offerEntries(draft)

  // The existing per-offer gap engine already owns price and duration. Never
  // duplicate those questions from templates in this migration step.
  if (CURRENT_ENGINE_OWNS_FACTS.has(fact.key)) return true

  switch (fact.key) {
    case 'service-area':
      return offers.some((offer) => Boolean(offer.serviceArea?.trim()))
    case 'travel-fee':
      return offers.some((offer) => Boolean(offer.travelFee?.trim()))
    default:
      return false
  }
}

/**
 * Convert ranked template intelligence into deterministic intake gap
 * candidates. This function is pure and does not write merchant data.
 *
 * Required template facts intentionally map to `quality`, not `blocking`, in
 * V1. A template knows what Nexez should investigate; it is not authority to
 * prevent an existing merchant from handing off to the builder.
 *
 * Equally important: an otherwise-useful fact is not surfaced until the
 * current intake grammar can persist the merchant's answer faithfully and
 * without changing unrelated commerce semantics.
 */
export function resolveCommerceIntakeTemplateContext(
  state: Pick<IntakeState, 'draft' | 'templateHint'>,
  options?: { maxCandidates?: number; matchLimit?: number; minimumScore?: number },
): CommerceIntakeTemplateContext {
  const { draft } = state
  const eligible = eligibleTemplatesForState(state)
  if (eligible.templates.length === 0) return { matches: [], candidates: [] }

  const intelligence = resolveCommerceTemplateIntelligence(
    eligible.templates,
    {
      industry: eligible.matchingIndustry,
      description: draft.description,
      offerNames: offerEntries(draft).map((offer) => offer.name).filter(Boolean),
    },
    {
      matchLimit: options?.matchLimit ?? 2,
      minimumScore: options?.minimumScore ?? 24,
      includeOpportunity: true,
    },
  )

  const candidates: CommerceTemplateGapCandidate[] = []
  const maxCandidates = options?.maxCandidates ?? 5

  for (const resolved of intelligence.facts) {
    if (candidates.length >= maxCandidates) break
    if (factAlreadyCovered(resolved.fact, draft)) continue

    const field = MATERIALIZABLE_FACT_FIELDS[resolved.fact.key]
    if (!field) continue

    const strongest = resolved.sources[0]
    if (!strongest) continue
    const kind = factKind(resolved.fact)
    const rankWithinKind = candidates.filter((candidate) => candidate.gap.kind === kind).length
    const priority = (kind === 'opportunity' ? 270 : 170) + rankWithinKind

    candidates.push({
      gap: {
        id: `tpl:${strongest.ref.id}:${resolved.fact.key}`,
        field,
        question: resolved.fact.ask,
        why: resolved.fact.why,
        kind,
        priority,
      },
      dedupKey: `knowledge:${field}`,
      oneShot: false,
      templateId: strongest.ref.id,
      templateVersion: strongest.ref.version,
      factKey: resolved.fact.key,
    })
  }

  return { matches: intelligence.matches, candidates }
}

export function getCommerceTemplateGapCandidates(
  state: Pick<IntakeState, 'draft' | 'templateHint'>,
  options?: { maxCandidates?: number; matchLimit?: number; minimumScore?: number },
): CommerceTemplateGapCandidate[] {
  return resolveCommerceIntakeTemplateContext(state, options).candidates
}
