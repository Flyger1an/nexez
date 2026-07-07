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
import { OfferItem, OfferRules } from './agent-page'
import { parseMoneyCents } from './checkout'

export type RuleDecision = 'auto_accept' | 'review' | 'flag'

export type RulesEvaluation = {
  decision: RuleDecision
  /** Machine-readable reason codes (stable - stored in negotiation metadata). */
  reasons: string[]
}

export type ProposalInput = {
  /** Parsed proposal amount in cents (from the agent's budget/proposed price), or null when unparseable. */
  proposedPriceCents: number | null
}

/**
 * Evaluate an agent proposal against the offer's pricing rules.
 * - Only negotiable offers can auto-accept; everything else defaults to human review.
 * - Below-minimum or beyond-max-discount proposals are flagged (still stored for
 *   the owner, but surfaced as outside the rules).
 */
export function evaluateProposal(offer: Pick<OfferItem, 'offerType' | 'rules' | 'price'>, input: ProposalInput): RulesEvaluation {
  if (offer.offerType !== 'negotiable') {
    return { decision: 'review', reasons: ['offer_not_negotiable'] }
  }

  const rules = offer.rules
  if (!rules || (!rules.minPrice && rules.maxDiscountPercent == null && !rules.autoAccept)) {
    return { decision: 'review', reasons: ['no_pricing_rules'] }
  }

  const proposed = input.proposedPriceCents
  if (proposed == null || proposed <= 0) {
    return { decision: 'review', reasons: ['no_proposed_price'] }
  }

  const minCents = parseMoneyCents(rules.minPrice)
  const listedCents = parseMoneyCents(offer.price)
  const reasons: string[] = []

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
    return { decision: 'flag', reasons }
  }

  if (rules.autoAccept) {
    const meetsMin = minCents == null || proposed >= minCents
    const withinBand =
      rules.autoAcceptWithinPercent == null ||
      (listedCents != null && proposed >= Math.round(listedCents * (1 - rules.autoAcceptWithinPercent / 100)))
    if (meetsMin && withinBand) {
      return { decision: 'auto_accept', reasons: ['meets_pricing_rules'] }
    }
    return { decision: 'review', reasons: ['outside_auto_accept_band'] }
  }

  return { decision: 'review', reasons: ['within_rules'] }
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
} {
  const rules = offer.rules
  return {
    offer_type: offer.offerType === 'negotiable' ? 'negotiable' : 'fixed',
    accepts_negotiation: offer.offerType === 'negotiable',
    ...(rules?.minNoticeHours != null ? { min_notice_hours: rules.minNoticeHours } : {}),
    ...(rules?.blackoutDates?.length ? { blackout_dates: rules.blackoutDates } : {}),
    ...(rules?.maxBookingsPerWeek != null ? { max_bookings_per_week: rules.maxBookingsPerWeek } : {}),
  }
}
