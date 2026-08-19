import type { CommerceTemplate } from './schema'

export type CommerceBuyerIntentRouteStatus = 'matched' | 'ambiguous' | 'unmatched'

export type CommerceBuyerIntentMatch = {
  template: CommerceTemplate
  score: number
  confidence: number
  matchedTerms: string[]
  reasons: string[]
}

export type CommerceBuyerIntentRoute = {
  request: string
  status: CommerceBuyerIntentRouteStatus
  matches: CommerceBuyerIntentMatch[]
}

export type CommerceBuyerIntentRouteOptions = {
  limit?: number
  minimumScore?: number
  minimumMargin?: number
}

type EvidenceSource = 'identity' | 'customer-intent' | 'customer-job' | 'offer-blueprint'

type WeightedEvidence = {
  source: EvidenceSource
  label: string
  weight: number
  tokens: Set<string>
}

const DEFAULT_MINIMUM_SCORE = 16
const DEFAULT_MINIMUM_MARGIN = 8

// Routing identifies the commerce pattern, not scheduling details or generic
// buying verbs. Keeping these terms out of the score reduces accidental matches
// caused by phrases such as "book this next Friday" that apply to many services.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'be', 'book', 'buy', 'by', 'can', 'could', 'do', 'done',
  'every', 'find', 'first', 'for', 'from', 'get', 'give', 'have', 'help', 'i', 'in',
  'is', 'it', 'me', 'my', 'need', 'next', 'of', 'on', 'one', 'our', 'please', 'service',
  'services', 'some', 'someone', 'that', 'the', 'this', 'to', 'total', 'under', 'us',
  'want', 'we', 'with', 'would', 'you', 'your',
  'today', 'tomorrow', 'morning', 'afternoon', 'evening', 'night', 'week', 'weekend',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
])

const SOURCE_LABELS: Record<EvidenceSource, string> = {
  identity: 'template identity',
  'customer-intent': 'customer intent',
  'customer-job': 'customer job',
  'offer-blueprint': 'offer blueprint',
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Small deterministic morphology helper. This is intentionally conservative:
 * it only collapses common service-language variants (cleaner/cleaning,
 * tutor/tutoring, photographer/photography) without introducing a general NLP
 * dependency or model-based classification.
 */
function tokenFamily(token: string): string {
  if (token.endsWith('ography') && token.length > 8) return token.slice(0, -1)
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3)
  if (token.endsWith('ers') && token.length > 6) return token.slice(0, -3)
  if (token.endsWith('er') && token.length > 5) return token.slice(0, -2)
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2)
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1)
  return token
}

function meaningfulTokens(value: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []

  for (const raw of normalize(value).split(' ')) {
    if (!raw || raw.length < 2 || STOPWORDS.has(raw)) continue
    const family = tokenFamily(raw)
    if (!family || STOPWORDS.has(family) || seen.has(family)) continue
    seen.add(family)
    tokens.push(family)
  }

  return tokens
}

function evidence(source: EvidenceSource, label: string, weight: number, value: string): WeightedEvidence {
  return {
    source,
    label,
    weight,
    tokens: new Set(meaningfulTokens(value)),
  }
}

function buildBuyerEvidence(template: CommerceTemplate): WeightedEvidence[] {
  return [
    evidence('identity', template.title, 16, `${template.title} ${template.industry}`),
    ...template.customerIntents.map((intent) =>
      evidence('customer-intent', intent.id, 12, intent.text),
    ),
    ...template.customerJobs.map((job, index) =>
      evidence('customer-job', `job-${index + 1}`, 6, job),
    ),
    ...template.offerBlueprints.map((offer) =>
      evidence(
        'offer-blueprint',
        offer.key,
        10,
        [offer.name, offer.description, ...(offer.commonConfiguration ?? [])].join(' '),
      ),
    ),
  ]
}

export function scoreCommerceBuyerIntent(
  template: CommerceTemplate,
  request: string,
): CommerceBuyerIntentMatch {
  const requestTokens = meaningfulTokens(request)
  const buyerEvidence = buildBuyerEvidence(template)
  const matchedTerms: string[] = []
  const matchedBySource = new Map<EvidenceSource, Set<string>>()
  let score = 0

  for (const requestToken of requestTokens) {
    let strongestWeight = 0
    let strongestSource: EvidenceSource | null = null

    for (const item of buyerEvidence) {
      if (!item.tokens.has(requestToken) || item.weight <= strongestWeight) continue
      strongestWeight = item.weight
      strongestSource = item.source
    }

    if (!strongestSource || strongestWeight === 0) continue
    score += strongestWeight
    matchedTerms.push(requestToken)
    const sourceTerms = matchedBySource.get(strongestSource) ?? new Set<string>()
    sourceTerms.add(requestToken)
    matchedBySource.set(strongestSource, sourceTerms)
  }

  const confidence = requestTokens.length === 0 ? 0 : matchedTerms.length / requestTokens.length
  const reasons = [...matchedBySource.entries()]
    .sort((left, right) => SOURCE_LABELS[left[0]].localeCompare(SOURCE_LABELS[right[0]]))
    .map(([source, terms]) => `${SOURCE_LABELS[source]}: ${[...terms].sort().join(', ')}`)

  return {
    template,
    score,
    confidence,
    matchedTerms: [...matchedTerms].sort(),
    reasons,
  }
}

/**
 * Deterministically route a buyer's free-text request to canonical commerce
 * knowledge. This router is deliberately separate from the seller matcher:
 * seller matchHints describe merchant evidence, while this function only uses
 * buyer-facing template identity, customer intents/jobs, and offer blueprints.
 *
 * The router may abstain (`unmatched`) or surface ambiguity instead of forcing a
 * category. It never writes merchant facts, selects an actual merchant, quotes a
 * price, or authorizes a transaction.
 */
export function routeCommerceBuyerIntent(
  templates: CommerceTemplate[],
  request: string,
  options?: CommerceBuyerIntentRouteOptions,
): CommerceBuyerIntentRoute {
  const limit = Math.max(1, Math.min(options?.limit ?? 3, 10))
  const minimumScore = Math.max(1, options?.minimumScore ?? DEFAULT_MINIMUM_SCORE)
  const minimumMargin = Math.max(0, options?.minimumMargin ?? DEFAULT_MINIMUM_MARGIN)
  const requestTokens = meaningfulTokens(request)

  if (requestTokens.length === 0) {
    return { request, status: 'unmatched', matches: [] }
  }

  const ranked = templates
    .map((template) => scoreCommerceBuyerIntent(template, request))
    .filter((match) => match.score >= minimumScore)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.confidence - left.confidence ||
        left.template.id.localeCompare(right.template.id) ||
        left.template.version - right.template.version,
    )
    .slice(0, limit)

  const strongest = ranked[0]
  if (!strongest) return { request, status: 'unmatched', matches: [] }

  const runnerUp = ranked[1]
  const ambiguous = Boolean(runnerUp && strongest.score - runnerUp.score < minimumMargin)

  return {
    request,
    status: ambiguous ? 'ambiguous' : 'matched',
    matches: ranked,
  }
}
