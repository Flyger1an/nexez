// Smart Rules Phase 1 - pure, framework-free evaluation of agent proposals and
// booking constraints against an offer's owner-defined rules.
//
// Privacy invariant: pricing rules (minPrice, maxDiscountPercent,
// autoAcceptWithinPercent, autoAccept) are owner-private and only ever used
// server-side. `publicBookingConstraints` is the ONLY shape that may reach
// agent.json / mcp.json / public HTML.
//
// Phase 2 hook: LLM proposal review + counter-suggestions consume the same
// RulesEvaluation produced here (decision 'review' is the LLM's entry point).
import type { OfferItem, OfferRules } from './agent-page'
import { parseMoneyCents } from './checkout'
import {
  normalizeNegotiationTerms,
  scopePhraseMatches,
  splitMerchantScope,
} from './negotiation-terms'

export type RuleDecision = 'auto_accept' | 'review' | 'flag'

export type RuleCheckKey =
  | 'price'
  | 'included_scope'
  | 'excluded_scope'
  | 'revision_limit'
  | 'project_length'

export type RuleCheck = {
  key: RuleCheckKey
  status: 'pass' | 'review' | 'fail'
  reason: string
}

export type RulesEvaluation = {
  schemaVersion: 2
  decision: RuleDecision
  /** Machine-readable reason codes (stable - stored in negotiation metadata). */
  reasons: string[]
  /** Field-level evidence. Values and private thresholds are never stored here. */
  checks: RuleCheck[]
}

export type ProposalInput = {
  /** Parsed proposal amount in cents (from the agent's budget/proposed price), or null when unparseable. */
  proposedPriceCents: number | null
  /** Buyer-authored terms. Only the documented vocabulary becomes rule authority. */
  requestedTerms?: Record<string, unknown> | null
}

/**
 * Evaluate an agent proposal against the offer's pricing rules.
 * - Only negotiable offers can auto-accept; everything else defaults to human review.
 * - Below-minimum or beyond-max-discount proposals are flagged (still stored for
 *   the owner, but surfaced as outside the rules).
 */
export function evaluateProposal(offer: Pick<OfferItem, 'offerType' | 'rules' | 'price'>, input: ProposalInput): RulesEvaluation {
  if (offer.offerType !== 'negotiable') {
    return evaluation('review', ['offer_not_negotiable'], [])
  }

  const rules = offer.rules
  const pricing = evaluatePricingRules(offer, input.proposedPriceCents)
  const termChecks = evaluateTermRules(rules, input.requestedTerms)
  const reasons = uniqueStrings([
    ...pricing.reasons,
    ...termChecks.map((check) => check.reason),
  ])
  const checks = [...pricing.checks, ...termChecks]

  if (pricing.decision === 'flag' || termChecks.some((check) => check.status === 'fail')) {
    return evaluation('flag', reasons, checks)
  }
  if (pricing.decision === 'auto_accept' && termChecks.every((check) => check.status === 'pass')) {
    return evaluation('auto_accept', reasons, checks)
  }
  return evaluation('review', reasons, checks)
}

function evaluatePricingRules(
  offer: Pick<OfferItem, 'rules' | 'price'>,
  proposed: number | null,
): Pick<RulesEvaluation, 'decision' | 'reasons' | 'checks'> {
  const rules = offer.rules
  const hasMinPrice = typeof rules?.minPrice === 'string' && Boolean(rules.minPrice.trim())
  const hasDiscountLimit = rules?.maxDiscountPercent != null
  const hasAutoAccept = rules?.autoAccept === true
  const hasAutoBand = rules?.autoAcceptWithinPercent != null
  if (!rules || (!hasMinPrice && !hasDiscountLimit && !hasAutoAccept && !hasAutoBand)) {
    return { decision: 'review', reasons: ['no_pricing_rules'], checks: [] }
  }

  if (proposed == null || proposed <= 0) {
    return {
      decision: 'review',
      reasons: ['no_proposed_price'],
      checks: [{ key: 'price', status: 'review', reason: 'price_not_provided' }],
    }
  }

  const minCents = parseMoneyCents(rules.minPrice)
  const listedCents = parseMoneyCents(offer.price)
  const reasons: string[] = []

  if (
    (hasMinPrice && minCents == null)
    || !validPercent(rules.maxDiscountPercent)
    || !validPercent(rules.autoAcceptWithinPercent)
    || ((hasDiscountLimit || hasAutoBand) && listedCents == null)
  ) {
    return {
      decision: 'review',
      reasons: ['price_rule_misconfigured'],
      checks: [{ key: 'price', status: 'review', reason: 'price_rule_misconfigured' }],
    }
  }

  if (minCents != null && proposed < minCents) {
    reasons.push('below_min_price')
  }
  if (
    rules.maxDiscountPercent != null &&
    listedCents != null &&
    proposed < Math.round(listedCents * (1 - rules.maxDiscountPercent / 100))
  ) {
    reasons.push('exceeds_max_discount')
  }
  if (reasons.length > 0) {
    return {
      decision: 'flag',
      reasons,
      checks: [{ key: 'price', status: 'fail', reason: 'outside_price_rules' }],
    }
  }

  if (rules.autoAccept) {
    const meetsMin = minCents == null || proposed >= minCents
    const withinBand =
      rules.autoAcceptWithinPercent == null ||
      (listedCents != null && proposed >= Math.round(listedCents * (1 - rules.autoAcceptWithinPercent / 100)))
    if (meetsMin && withinBand) {
      return {
        decision: 'auto_accept',
        reasons: ['meets_pricing_rules'],
        checks: [{ key: 'price', status: 'pass', reason: 'price_within_rules' }],
      }
    }
    return {
      decision: 'review',
      reasons: ['outside_auto_accept_band'],
      checks: [{ key: 'price', status: 'review', reason: 'price_requires_review' }],
    }
  }

  return {
    decision: 'review',
    reasons: ['within_rules'],
    checks: [{ key: 'price', status: 'pass', reason: 'price_within_rules' }],
  }
}

function evaluateTermRules(
  rules: OfferRules | undefined,
  requestedTerms: Record<string, unknown> | null | undefined,
): RuleCheck[] {
  if (!rules) return []
  const terms = normalizeNegotiationTerms(requestedTerms)
  const requestedScope = terms.scope
  const checks: RuleCheck[] = []
  const included = splitMerchantScope(rules.includedScope)
  const excluded = splitMerchantScope(rules.excludedScope)

  if (included.length) {
    checks.push(!requestedScope.length
      ? { key: 'included_scope', status: 'review', reason: 'scope_not_provided' }
      : scopesOverlap(requestedScope, included)
        ? { key: 'included_scope', status: 'pass', reason: 'included_scope_match' }
        : { key: 'included_scope', status: 'review', reason: 'scope_needs_review' })
  }
  if (excluded.length) {
    checks.push(!requestedScope.length
      ? { key: 'excluded_scope', status: 'review', reason: 'scope_not_provided' }
      : scopesOverlap(requestedScope, excluded)
        ? { key: 'excluded_scope', status: 'fail', reason: 'excluded_scope_requested' }
        : { key: 'excluded_scope', status: 'pass', reason: 'excluded_scope_clear' })
  }
  if (rules.maxRevisions != null) {
    checks.push(numericLimitCheck(
      'revision_limit',
      rules.maxRevisions,
      terms.revisionCount,
      'revision_count_not_provided',
      'invalid_revision_count',
      'within_revision_limit',
      'exceeds_revision_limit',
      0,
    ))
  }
  if (rules.maxProjectWeeks != null) {
    checks.push(numericLimitCheck(
      'project_length',
      rules.maxProjectWeeks,
      terms.projectWeeks,
      'project_length_not_provided',
      'invalid_project_length',
      'within_project_length',
      'exceeds_project_length',
      1,
    ))
  }
  return checks
}

function numericLimitCheck(
  key: Extract<RuleCheckKey, 'revision_limit' | 'project_length'>,
  limit: number,
  term: ReturnType<typeof normalizeNegotiationTerms>['revisionCount'],
  absentReason: string,
  invalidReason: string,
  passReason: string,
  failReason: string,
  minimum: number,
): RuleCheck {
  if (!Number.isSafeInteger(limit) || limit < minimum || limit > 1_000) {
    return { key, status: 'review', reason: 'seller_term_rule_misconfigured' }
  }
  if (term.state === 'absent') return { key, status: 'review', reason: absentReason }
  if (term.state === 'invalid') return { key, status: 'review', reason: invalidReason }
  return term.value <= limit
    ? { key, status: 'pass', reason: passReason }
    : { key, status: 'fail', reason: failReason }
}

function scopesOverlap(requested: string[], configured: string[]): boolean {
  return requested.some((request) => configured.some((rule) => scopePhraseMatches(request, rule)))
}

function validPercent(value: number | null | undefined): boolean {
  return value == null || (Number.isFinite(value) && value >= 0 && value <= 100)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function evaluation(
  decision: RuleDecision,
  reasons: string[],
  checks: RuleCheck[],
): RulesEvaluation {
  return { schemaVersion: 2, decision, reasons: uniqueStrings(reasons), checks }
}

const PUBLIC_CHECK_COPY: Record<RuleCheckKey, {
  label: string
  messages: Record<string, string>
}> = {
  price: {
    label: 'Price',
    messages: {
      price_not_provided: 'Add a price for the seller to review.',
      price_rule_misconfigured: 'The seller needs to review the price manually.',
      outside_price_rules: 'The offered price is outside the seller\'s automatic rules.',
      price_within_rules: 'The offered price is within the seller\'s rules.',
      price_requires_review: 'The seller needs to review the offered price.',
    },
  },
  included_scope: {
    label: 'Requested work',
    messages: {
      scope_not_provided: 'Describe the requested work before automatic acceptance.',
      included_scope_match: 'The requested work matches what this offer includes.',
      scope_needs_review: 'The requested work needs seller review.',
    },
  },
  excluded_scope: {
    label: 'Excluded work',
    messages: {
      scope_not_provided: 'Describe the requested work before automatic acceptance.',
      excluded_scope_requested: 'Some requested work is excluded from this offer.',
      excluded_scope_clear: 'No explicitly excluded work was requested.',
    },
  },
  revision_limit: {
    label: 'Revisions',
    messages: {
      revision_count_not_provided: 'Add the requested revision count.',
      invalid_revision_count: 'Use a whole number for revisions.',
      within_revision_limit: 'The requested revisions are within the seller\'s limit.',
      exceeds_revision_limit: 'The requested revisions exceed the seller\'s limit.',
      seller_term_rule_misconfigured: 'The seller needs to review the revision limit.',
    },
  },
  project_length: {
    label: 'Project length',
    messages: {
      project_length_not_provided: 'Add the requested project length in weeks.',
      invalid_project_length: 'Use a whole number of weeks.',
      within_project_length: 'The requested project length is within the seller\'s limit.',
      exceeds_project_length: 'The requested project length exceeds the seller\'s limit.',
      seller_term_rule_misconfigured: 'The seller needs to review the project-length limit.',
    },
  },
}

export type PublicRulesEvaluation = {
  schemaVersion: 1
  outcome: 'meets_rules' | 'needs_review' | 'outside_rules'
  summary: string
  checks: Array<{
    key: RuleCheckKey
    label: string
    status: RuleCheck['status']
    message: string
  }>
}

/** Buyer-safe status artifact. Private thresholds and raw seller rules are never
 * copied from the stored evaluation. */
export function publicRulesEvaluation(value: unknown): PublicRulesEvaluation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Partial<RulesEvaluation>
  if (!['auto_accept', 'review', 'flag'].includes(String(source.decision))) return null
  const checks = Array.isArray(source.checks)
    ? source.checks.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
      const check = candidate as Partial<RuleCheck>
      if (!(check.key && check.key in PUBLIC_CHECK_COPY)) return []
      if (!['pass', 'review', 'fail'].includes(String(check.status))) return []
      const copy = PUBLIC_CHECK_COPY[check.key]
      return [{
        key: check.key,
        label: copy.label,
        status: check.status as RuleCheck['status'],
        message: copy.messages[String(check.reason)] ?? `${copy.label} needs seller review.`,
      }]
    })
    : []
  const outcome = source.decision === 'auto_accept'
    ? 'meets_rules'
    : source.decision === 'flag'
      ? 'outside_rules'
      : 'needs_review'
  return {
    schemaVersion: 1,
    outcome,
    summary: outcome === 'meets_rules'
      ? 'The proposal meets the seller\'s automatic rules.'
      : outcome === 'outside_rules'
        ? 'The proposal is outside at least one seller rule.'
        : 'The seller needs to review at least one term.',
    checks,
  }
}

/** Today (or a given instant) as a plain YYYY-MM-DD string in UTC. */
export function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** True when the plain YYYY-MM-DD date is in the offer's blackout list. */
export function isBlackoutDate(rules: OfferRules | undefined, ymd: string): boolean {
  return Boolean(rules?.blackoutDates?.includes(ymd))
}

/**
 * Calendar-protection check at booking time (Phase 1: what the platform can
 * enforce without calendar write access). Returns a human-readable error, or
 * null when the booking may proceed.
 */
export function getBookingRuleError(
  offer: Pick<OfferItem, 'rules'>,
  input: { now?: Date; recentBookingsThisWeek?: number },
): string | null {
  const rules = offer.rules
  if (!rules) return null

  const max = rules.maxBookingsPerWeek
  if (max != null && max > 0 && (input.recentBookingsThisWeek ?? 0) >= max) {
    return `This offer has reached its booking limit for the week (${max}). Please try again next week or send a proposal instead.`
  }

  if (isBlackoutDate(rules, toYmd(input.now ?? new Date()))) {
    return 'This offer is unavailable today (blackout date). Please choose another day.'
  }

  return null
}

/**
 * The ONLY rules shape that may be exposed to agents (agent.json, mcp.json,
 * public HTML). Never includes pricing rules.
 */
export function publicBookingConstraints(offer: Pick<OfferItem, 'offerType' | 'rules'>): {
  offer_type: 'fixed' | 'negotiable'
  accepts_negotiation: boolean
  min_notice_hours?: number
  blackout_dates?: string[]
  max_bookings_per_week?: number
  included_scope?: string
  excluded_scope?: string
  max_revisions?: number
  max_project_weeks?: number
} {
  const rules = offer.rules
  return {
    offer_type: offer.offerType === 'negotiable' ? 'negotiable' : 'fixed',
    accepts_negotiation: offer.offerType === 'negotiable',
    ...(rules?.minNoticeHours != null ? { min_notice_hours: rules.minNoticeHours } : {}),
    ...(rules?.blackoutDates?.length ? { blackout_dates: rules.blackoutDates } : {}),
    ...(rules?.maxBookingsPerWeek != null ? { max_bookings_per_week: rules.maxBookingsPerWeek } : {}),
    ...(rules?.includedScope ? { included_scope: rules.includedScope } : {}),
    ...(rules?.excludedScope ? { excluded_scope: rules.excludedScope } : {}),
    ...(rules?.maxRevisions != null ? { max_revisions: rules.maxRevisions } : {}),
    ...(rules?.maxProjectWeeks != null ? { max_project_weeks: rules.maxProjectWeeks } : {}),
  }
}
