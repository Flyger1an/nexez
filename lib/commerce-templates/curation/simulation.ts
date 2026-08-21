import type { CommerceCurationCandidate } from './types'

const QUERY_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'book', 'can', 'could', 'do', 'does', 'find', 'for', 'from', 'get',
  'handle', 'help', 'here', 'hire', 'i', 'in', 'is', 'it', 'looking', 'me', 'my', 'near', 'need', 'next',
  'of', 'on', 'or', 'please', 'professional', 'provider', 'search', 'searching', 'service', 'services',
  'someone', 'that', 'the', 'their', 'this', 'to', 'us', 'vendor', 'want', 'we', 'what', 'when', 'where',
  'will', 'with', 'would', 'you', 'your',
])

// These words describe fulfillment, audience, or the subject of a service;
// none is specific enough to establish the service category by itself. They
// may still help rank candidates after a service-identity term has matched.
const NON_IDENTITY_TITLE_TERMS = new Set([
  'ai', 'auto', 'automotive', 'bridal', 'business', 'car', 'college', 'commercial',
  'corporate', 'dog', 'emergency', 'event', 'fleet', 'home', 'interior', 'language',
  'lawn', 'managed', 'mobile', 'monthly', 'music', 'party', 'personal', 'pet',
  'private', 'property', 'recurring', 'test', 'vehicle', 'video', 'web', 'wedding',
])

const MINIMUM_AMBIGUITY_MARGIN = 4

const REQUEST_PREFIX_PATTERNS = [
  /^(?:please )?(?:can|could|would) you (?:please )?(?:help me )?(?:find|hire|book|get) (?:me )?/,
  /^(?:please )?(?:help me )?(?:find|hire|book|get) (?:me )?/,
  /^(?:i (?:need|want)(?: to (?:find|hire|book|get))?|i(?: m| am) looking for|looking for|searching for) /,
]

const SERVICE_DETAIL_BOUNDARY = /\s+(?:for|who|that|which|with|in|at|near|around|available|this|next|today|tomorrow|before|after)\b/

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

/**
 * Collapses a small set of common service-language variants without turning
 * this deterministic matcher into a fuzzy or model-based classifier.
 */
export function commerceIdentityTokenFamily(token: string): string {
  if (token.endsWith('ography') && token.length > 8) return token.slice(0, -1)
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3)
  if (token.endsWith('ers') && token.length > 6) return token.slice(0, -3)
  if (token.endsWith('er') && token.length > 5) return token.slice(0, -2)
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2)
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1)
  return token
}

function tokenFamilies(value: string): string[] {
  return [...new Set(tokens(value).map(commerceIdentityTokenFamily))]
}

const NON_IDENTITY_TITLE_TOKEN_FAMILIES = new Set(
  [...NON_IDENTITY_TITLE_TERMS].map(commerceIdentityTokenFamily),
)

function identityTitleTokens(value: string): Set<string> {
  return new Set(tokenFamilies(value).filter((token) => !NON_IDENTITY_TITLE_TOKEN_FAMILIES.has(token)))
}

function candidateIdentityTokens(candidate: CommerceCurationCandidate): Set<string> {
  return new Set([
    ...identityTitleTokens(candidate.title),
    ...candidate.simulationHints?.identityTerms.flatMap(tokenFamilies) ?? [],
  ])
}

/**
 * Narrows a buyer prompt to the requested service phrase before matching.
 * Requirements after "for", "with", a location, or a time boundary remain
 * useful context, but cannot silently change the service category.
 */
export function commerceRequestedServiceText(query: string): string {
  const original = normalize(query)
  let requested = original
  let anchored = false

  for (const prefix of REQUEST_PREFIX_PATTERNS) {
    const next = requested.replace(prefix, '')
    if (next !== requested) {
      requested = next
      anchored = true
      break
    }
  }

  requested = requested.replace(/^(?:a|an|the) /, '')
  if (!anchored) return requested

  const boundary = requested.search(SERVICE_DETAIL_BOUNDARY)
  return (boundary >= 0 ? requested.slice(0, boundary) : requested).trim()
}

/** Service evidence used by both Commerce Library and live-supply routing. */
export function commerceRequestedServiceIdentityTerms(query: string): string[] {
  return tokenFamilies(commerceRequestedServiceText(query))
    .filter((token) => !NON_IDENTITY_TITLE_TOKEN_FAMILIES.has(token))
}

/**
 * Keeps catalog-known service anchors when available and otherwise preserves
 * every unknown identity term. The latter makes uncovered requests fail
 * closed against live marketplace supply instead of accepting a weak overlap.
 */
export function commerceRequestedCatalogIdentityTerms(
  query: string,
  candidates: CommerceCurationCandidate[],
): string[] {
  const requestedTerms = commerceRequestedServiceIdentityTerms(query)
  const catalogTerms = new Set(candidates.flatMap((candidate) => [...candidateIdentityTokens(candidate)]))
  const recognizedTerms = requestedTerms.filter((term) => catalogTerms.has(term))
  return recognizedTerms.length ? recognizedTerms : requestedTerms
}

export type CommerceSimulationMatch = {
  candidate: CommerceCurationCandidate
  score: number
  matchedTerms: string[]
  matchedIdentityTerms: string[]
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
  const queryTokens = tokenFamilies(query)
  const requestedServiceText = commerceRequestedServiceText(query)
  const requestedServiceTokens = tokenFamilies(requestedServiceText)
  if (!queryTokens.length || !requestedServiceTokens.length) return null

  const ranked = candidates
    .map((candidate) => {
      const titleText = normalize(candidate.title)
      const serviceTokens = new Set([
        ...tokenFamilies(candidate.title),
        ...candidate.simulationHints?.identityTerms.flatMap(tokenFamilies) ?? [],
      ])
      const identityTokens = candidateIdentityTokens(candidate)
      const teachesTokens = new Set(tokenFamilies(candidate.teaches))
      const metadataTokens = new Set(tokenFamilies([
        candidate.domain,
        candidate.primaryArchetype,
        ...candidate.capabilityTags,
        ...candidate.gapSignals,
      ].join(' ')))

      const matchedIdentityTerms = requestedServiceTokens.filter((token) => identityTokens.has(token))
      if (!matchedIdentityTerms.length) return null

      const exactTitleMatch = Boolean(titleText && requestedServiceText.includes(titleText))
      let score = exactTitleMatch ? 16 : 0
      const matchedTerms: string[] = []

      for (const token of queryTokens) {
        if (serviceTokens.has(token)) {
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
        matchedIdentityTerms: [...new Set(matchedIdentityTerms)],
        exactTitleMatch,
        identityMatchCount: matchedIdentityTerms.length,
      }
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match && match.score > 0))
    .sort((a, b) =>
      b.score - a.score ||
      b.identityMatchCount - a.identityMatchCount ||
      a.candidate.ordinal - b.candidate.ordinal,
    )

  const strongest = ranked[0]
  if (!strongest) return null

  const exactMatches = ranked.filter((match) => match.exactTitleMatch)
  if (exactMatches.length > 1) return null

  const runnerUp = ranked[1]
  const strongestIdentityTerms = new Set(strongest.matchedIdentityTerms)
  const hasDistinctCompetingIdentity = ranked.slice(1).some((match) =>
    match.matchedIdentityTerms.some((term) => !strongestIdentityTerms.has(term)),
  )
  const hasTiedAmbiguousRunnerUp = Boolean(
    runnerUp &&
    strongest.identityMatchCount === runnerUp.identityMatchCount &&
    strongest.score - runnerUp.score < MINIMUM_AMBIGUITY_MARGIN,
  )
  if (
    hasDistinctCompetingIdentity ||
    (!strongest.exactTitleMatch && hasTiedAmbiguousRunnerUp)
  ) {
    return null
  }

  return {
    candidate: strongest.candidate,
    score: strongest.score,
    matchedTerms: strongest.matchedTerms,
    matchedIdentityTerms: strongest.matchedIdentityTerms,
  }
}
