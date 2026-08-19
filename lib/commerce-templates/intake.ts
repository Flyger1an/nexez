import type { Gap, GapKind, IntakeDraft, IntakeState } from '../intake/types'
import { resolveCommerceTemplateIntelligence } from './intelligence'
import { commerceTemplates } from './registry'
import type { CommerceFact } from './schema'
import type { CommerceTemplateMatch } from './matcher'

export type CommerceTemplateGapCandidate = {
  gap: Gap
  dedupKey: string
  oneShot: true
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

const FACT_FIELD_ALIASES: Record<string, string> = {
  'service-area': 'offer.serviceArea',
  'travel-fee': 'offer.travelFee',
  minimums: 'offer.minimums',
  dietary: 'offer.dietary',
  turnaround: 'offer.turnaround',
  licensing: 'offer.licensing',
  timeline: 'offer.timeline',
  revisions: 'offer.rules.maxRevisions',
  'project-scope': 'offer.rules.includedScope',
  'notice-policy': 'offer.rules.minNoticeHours',
}

function offerEntries(draft: IntakeDraft) {
  return [...draft.services, ...draft.products]
}

function factField(fact: CommerceFact): string {
  return FACT_FIELD_ALIASES[fact.key] ?? `template.${fact.key}`
}

function factKind(fact: CommerceFact): GapKind {
  // V1 safety boundary: commerce-template knowledge may improve the interview,
  // but it must not create new publication blockers until every fact has a
  // proven materialization path. Existing hard blockers remain authoritative.
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
    case 'notice-policy':
      return offers.some((offer) => offer.rules?.minNoticeHours != null)
    case 'revisions':
      return offers.some((offer) => offer.rules?.maxRevisions != null)
    case 'project-scope':
      return offers.some((offer) => Boolean(offer.rules?.includedScope?.trim()))
    case 'timeline':
      return offers.some((offer) => offer.rules?.maxProjectWeeks != null)
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
 */
export function resolveCommerceIntakeTemplateContext(
  state: Pick<IntakeState, 'draft'>,
  options?: { maxCandidates?: number; matchLimit?: number; minimumScore?: number },
): CommerceIntakeTemplateContext {
  const { draft } = state
  if (!draft.industry.trim()) return { matches: [], candidates: [] }

  const canonicalIndustry = draft.industry.trim().toLowerCase()
  const eligibleTemplates = commerceTemplates.filter(
    (template) => template.status === 'active' && template.industry.trim().toLowerCase() === canonicalIndustry,
  )
  if (eligibleTemplates.length === 0) return { matches: [], candidates: [] }

  const intelligence = resolveCommerceTemplateIntelligence(
    eligibleTemplates,
    {
      industry: draft.industry,
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

    const strongest = resolved.sources[0]
    if (!strongest) continue
    const field = factField(resolved.fact)
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
      oneShot: true,
      templateId: strongest.ref.id,
      templateVersion: strongest.ref.version,
      factKey: resolved.fact.key,
    })
  }

  return { matches: intelligence.matches, candidates }
}

export function getCommerceTemplateGapCandidates(
  state: Pick<IntakeState, 'draft'>,
  options?: { maxCandidates?: number; matchLimit?: number; minimumScore?: number },
): CommerceTemplateGapCandidate[] {
  return resolveCommerceIntakeTemplateContext(state, options).candidates
}
