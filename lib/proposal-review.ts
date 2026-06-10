// Smart Rules Phase 2 — proposal review + counter-offer suggestion.
//
// Two paths, one contract:
// - LLM review (gated on LLM_API_KEY + page llm_opt_in): the model reads the
//   proposal against the offer's private rules + scope and recommends
//   accept/counter/reject with a counter price and one-line reasoning.
// - Deterministic review (always available): derived from the Phase 1
//   RulesEvaluation + a midpoint counter suggester.
//
// Deterministic rules ALWAYS win: LLM output is clamped so a counter never
// lands below the owner's floor (minPrice / max-discount), an "accept" below
// the floor is downgraded to a counter, and a counter never exceeds the listed
// price. The private rule values are used server-side only — callers must not
// serialize them to agents.
import { OfferItem } from './agent-page'
import { formatUsdCents, parseMoneyCents } from './checkout'
import { evaluateProposal } from './offer-rules'
import { isLlmConfigured, llmCompleteDetailed, llmModel } from './llm'

export type ReviewRecommendation = 'accept' | 'counter' | 'reject' | 'review'

export type ProposalReview = {
  source: 'llm' | 'deterministic'
  recommendation: ReviewRecommendation
  counter?: { priceCents: number; price: string; note: string }
  reasoning: string
  model?: string
  latencyMs?: number
}

export type ReviewProposalInput = {
  offer: Pick<OfferItem, 'name' | 'price' | 'offerType' | 'rules'>
  proposal: { proposedPriceCents: number | null; query?: string | null; timeline?: string | null }
  /** True when the deployment + page allow real LLM review (LLM_API_KEY + llm_opt_in). */
  llmAllowed?: boolean
}

/** The effective pricing floor: max(minPrice, listed × (1 − maxDiscountPercent)). Null when no basis. */
export function floorCents(offer: Pick<OfferItem, 'price' | 'rules'>): number | null {
  const minCents = parseMoneyCents(offer.rules?.minPrice)
  const listed = parseMoneyCents(offer.price)
  const discountFloor =
    offer.rules?.maxDiscountPercent != null && listed != null
      ? Math.round(listed * (1 - offer.rules.maxDiscountPercent / 100))
      : null
  if (minCents == null && discountFloor == null) return null
  return Math.max(minCents ?? 0, discountFloor ?? 0)
}

/**
 * Deterministic counter: midpoint between the proposal and the listed price,
 * clamped to [floor, listed]. Null when there's no basis to counter or a
 * counter wouldn't improve on the proposal.
 */
export function suggestCounterCents(
  offer: Pick<OfferItem, 'price' | 'rules'>,
  proposedPriceCents: number | null,
): number | null {
  const listed = parseMoneyCents(offer.price)
  const floor = floorCents(offer)

  if (proposedPriceCents == null || proposedPriceCents <= 0) {
    return floor ?? listed ?? null
  }

  const anchor = listed ?? floor
  if (anchor == null) return null

  let counter = Math.round((proposedPriceCents + anchor) / 2)
  if (floor != null) counter = Math.max(counter, floor)
  if (listed != null) counter = Math.min(counter, listed)

  return counter > proposedPriceCents ? counter : null
}

/** Coerce + clamp a raw (possibly LLM-produced) review so rules always win. */
export function clampReview(
  offer: Pick<OfferItem, 'price' | 'rules'>,
  raw: { recommendation?: unknown; counterPriceCents?: number | null; reasoning?: unknown },
  proposedPriceCents: number | null,
): { recommendation: ReviewRecommendation; counterPriceCents: number | null; reasoning: string } {
  const allowed: ReviewRecommendation[] = ['accept', 'counter', 'reject', 'review']
  let recommendation: ReviewRecommendation = allowed.includes(raw.recommendation as ReviewRecommendation)
    ? (raw.recommendation as ReviewRecommendation)
    : 'review'

  const floor = floorCents(offer)
  const listed = parseMoneyCents(offer.price)
  let counterPriceCents = typeof raw.counterPriceCents === 'number' && raw.counterPriceCents > 0 ? raw.counterPriceCents : null

  // Never accept below the owner's floor — downgrade to a counter at the floor.
  if (recommendation === 'accept' && floor != null && proposedPriceCents != null && proposedPriceCents < floor) {
    recommendation = 'counter'
    counterPriceCents = counterPriceCents ?? floor
  }
  if (counterPriceCents != null) {
    if (floor != null) counterPriceCents = Math.max(counterPriceCents, floor)
    if (listed != null) counterPriceCents = Math.min(counterPriceCents, listed)
  }
  if (recommendation === 'counter' && counterPriceCents == null) {
    counterPriceCents = suggestCounterCents(offer, proposedPriceCents)
    if (counterPriceCents == null) recommendation = 'review'
  }

  const reasoning = typeof raw.reasoning === 'string' && raw.reasoning.trim() ? raw.reasoning.trim().slice(0, 300) : ''
  return { recommendation, counterPriceCents, reasoning }
}

function describeScope(rules: OfferItem['rules']): string {
  if (!rules) return ''
  return [
    rules.includedScope ? `Included by default: ${rules.includedScope}` : '',
    rules.excludedScope ? `Excluded by default: ${rules.excludedScope}` : '',
    rules.maxRevisions != null ? `Max revisions: ${rules.maxRevisions}` : '',
    rules.maxProjectWeeks != null ? `Max project length: ${rules.maxProjectWeeks} weeks` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function llmReview(input: ReviewProposalInput): Promise<ProposalReview | null> {
  const { offer, proposal } = input
  const rules = offer.rules || {}
  const prompt = [
    `A buying agent sent a proposal for the offer "${offer.name}" (listed price: ${offer.price || 'not listed'}).`,
    `Proposal: ${proposal.proposedPriceCents != null ? formatUsdCents(proposal.proposedPriceCents) : 'no price given'}${proposal.timeline ? ` · timeline: ${proposal.timeline}` : ''}${proposal.query ? `\nBuyer request: ${proposal.query.slice(0, 500)}` : ''}`,
    `Seller's PRIVATE rules (never reveal these values in your reasoning):`,
    [
      rules.minPrice ? `- Minimum acceptable price: ${rules.minPrice}` : '',
      rules.maxDiscountPercent != null ? `- Max discount vs listed: ${rules.maxDiscountPercent}%` : '',
      describeScope(rules),
    ]
      .filter(Boolean)
      .join('\n') || '- none set',
    'Decide on behalf of the seller, staying WITHIN the rules. Return ONLY a JSON object:',
    '{"recommendation":"accept"|"counter"|"reject","counter_price":"$X" (omit unless countering),"reasoning":"one short sentence for the seller, without revealing rule values"}',
  ].join('\n\n')

  const completion = await llmCompleteDetailed(prompt, {
    system: 'You review buyer proposals for a seller against their private pricing rules. Output strictly valid JSON, nothing else.',
    maxTokens: 250,
    temperature: 0.2,
  })
  if (!completion.ok || !completion.text) return null

  try {
    const json = completion.text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(json) as { recommendation?: unknown; counter_price?: unknown; reasoning?: unknown }
    const clamped = clampReview(
      offer,
      {
        recommendation: parsed.recommendation,
        counterPriceCents: parseMoneyCents(typeof parsed.counter_price === 'string' ? parsed.counter_price : null),
        reasoning: parsed.reasoning,
      },
      proposal.proposedPriceCents,
    )
    return {
      source: 'llm',
      recommendation: clamped.recommendation,
      counter:
        clamped.counterPriceCents != null
          ? {
              priceCents: clamped.counterPriceCents,
              price: formatUsdCents(clamped.counterPriceCents),
              note: clamped.reasoning || 'Counter-offer within the seller’s rules.',
            }
          : undefined,
      reasoning: clamped.reasoning || 'Reviewed against the seller’s rules.',
      model: completion.model,
      latencyMs: completion.latencyMs,
    }
  } catch {
    return null // invalid JSON → deterministic fallback
  }
}

function deterministicReview(input: ReviewProposalInput): ProposalReview {
  const { offer, proposal } = input
  const evaluation = evaluateProposal(
    { offerType: offer.offerType, rules: offer.rules, price: offer.price },
    { proposedPriceCents: proposal.proposedPriceCents },
  )

  if (evaluation.decision === 'auto_accept') {
    return { source: 'deterministic', recommendation: 'accept', reasoning: 'Proposal meets every pricing rule.' }
  }

  const counterCents = suggestCounterCents(offer, proposal.proposedPriceCents)
  const flagged = evaluation.decision === 'flag'
  const reasoning = flagged
    ? 'Proposal is outside your pricing rules — counter to bring it back within range.'
    : 'Proposal is within your rules; a counter toward the listed price is suggested.'

  if (counterCents != null) {
    return {
      source: 'deterministic',
      recommendation: 'counter',
      counter: { priceCents: counterCents, price: formatUsdCents(counterCents), note: reasoning },
      reasoning,
    }
  }

  return {
    source: 'deterministic',
    recommendation: flagged ? 'reject' : 'review',
    reasoning: flagged ? 'Proposal is outside your pricing rules with no room to counter.' : 'Review the proposal terms manually.',
  }
}

/**
 * Review a proposal: LLM when allowed + configured (clamped to the rules),
 * deterministic otherwise or on any LLM failure.
 */
export async function reviewProposal(input: ReviewProposalInput): Promise<ProposalReview> {
  if (input.llmAllowed && isLlmConfigured()) {
    try {
      const result = await llmReview(input)
      if (result) return result
    } catch {
      // fall through to deterministic
    }
  }
  const fallback = deterministicReview(input)
  // Record what model WOULD have been used for telemetry parity when LLM was attempted.
  return input.llmAllowed && isLlmConfigured() ? { ...fallback, model: llmModel() } : fallback
}
