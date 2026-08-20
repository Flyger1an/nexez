import type { CommerceCurationCandidate } from './types'

const QUERY_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'can', 'could', 'do', 'does', 'for', 'from', 'get', 'handle',
  'here', 'i', 'in', 'is', 'it', 'me', 'my', 'near', 'next', 'of', 'on', 'or', 'please', 'service', 'services',
  'that', 'the', 'their', 'this', 'to', 'us', 'want', 'we', 'what', 'when', 'where', 'will', 'with', 'would',
  'you', 'your',
])

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 1 && !QUERY_STOPWORDS.has(token))
}

export type CommerceSimulationMatch = {
  candidate: CommerceCurationCandidate
  score: number
  matchedTerms: string[]
}

/**
 * Finds the closest Commerce Library scenario for an explicitly labelled
 * no-supply simulation. This is NOT marketplace ranking and never turns a
 * curation candidate into merchant inventory or merchant truth.
 */
export function findCommerceSimulationMatch(
  query: string,
  candidates: CommerceCurationCandidate[],
): CommerceSimulationMatch | null {
  const queryText = normalize(query)
  const queryTokens = [...new Set(tokens(query))]
  if (!queryTokens.length) return null

  const ranked = candidates
    .map((candidate) => {
      const titleText = normalize(candidate.title)
      const titleTokens = new Set(tokens(candidate.title))
      const teachesTokens = new Set(tokens(candidate.teaches))
      const metadataTokens = new Set(tokens([
        candidate.domain,
        candidate.primaryArchetype,
        ...candidate.capabilityTags,
        ...candidate.gapSignals,
      ].join(' ')))

      let score = titleText && queryText.includes(titleText) ? 16 : 0
      const matchedTerms: string[] = []

      for (const token of queryTokens) {
        if (titleTokens.has(token)) {
          score += 6
          matchedTerms.push(token)
        } else if (teachesTokens.has(token)) {
          score += 2
          matchedTerms.push(token)
        } else if (metadataTokens.has(token)) {
          score += 1
          matchedTerms.push(token)
        }
      }

      return {
        candidate,
        score,
        matchedTerms: [...new Set(matchedTerms)],
      }
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.ordinal - b.candidate.ordinal)

  return ranked[0] ?? null
}
