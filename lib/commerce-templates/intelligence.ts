import { matchCommerceTemplates, type CommerceTemplateMatch, type CommerceTemplateMatchInput } from './matcher'
import type { CommerceFact, CommerceTemplate, CommerceTemplateRef } from './schema'

export type ResolvedCommerceFact = {
  fact: CommerceFact
  /** Template(s) that contributed the same semantic fact key, strongest match first. */
  sources: Array<{ ref: CommerceTemplateRef; matchScore: number }>
  /** Strongest contributing match score. */
  matchScore: number
}

export type CommerceTemplateIntelligence = {
  matches: CommerceTemplateMatch[]
  facts: ResolvedCommerceFact[]
}

const IMPORTANCE_ORDER: Record<CommerceFact['importance'], number> = {
  required: 0,
  quality: 1,
  opportunity: 2,
}

/**
 * Resolve ranked template knowledge for a merchant without touching intake state.
 * This is intentionally one step before the future Intake Gap adapter: it can
 * influence what Nexxi should investigate, but cannot materialize an answer.
 */
export function resolveCommerceTemplateIntelligence(
  templates: CommerceTemplate[],
  input: CommerceTemplateMatchInput,
  options?: {
    matchLimit?: number
    minimumScore?: number
    includeOpportunity?: boolean
  },
): CommerceTemplateIntelligence {
  const matches = matchCommerceTemplates(templates, input, {
    limit: options?.matchLimit ?? 3,
    minimumScore: options?.minimumScore ?? 12,
  })

  const byFactKey = new Map<string, ResolvedCommerceFact>()

  for (const match of matches) {
    const facts = [
      ...match.template.requiredFacts,
      ...match.template.qualityFacts,
      ...(options?.includeOpportunity === false ? [] : match.template.opportunityFacts),
    ]

    for (const fact of facts) {
      const source = { ref: { id: match.template.id, version: match.template.version }, matchScore: match.score }
      const existing = byFactKey.get(fact.key)
      if (!existing) {
        byFactKey.set(fact.key, { fact, sources: [source], matchScore: match.score })
        continue
      }

      existing.sources.push(source)
      existing.sources.sort((a, b) => b.matchScore - a.matchScore || a.ref.id.localeCompare(b.ref.id))

      // The strongest template supplies phrasing/importance when semantic keys
      // collide; every contributing template ref is preserved for inspection.
      if (match.score > existing.matchScore) {
        existing.fact = fact
        existing.matchScore = match.score
      }
    }
  }

  const facts = [...byFactKey.values()].sort((a, b) => {
    const importance = IMPORTANCE_ORDER[a.fact.importance] - IMPORTANCE_ORDER[b.fact.importance]
    if (importance !== 0) return importance
    if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore
    return a.fact.key.localeCompare(b.fact.key)
  })

  return { matches, facts }
}
