import type { OfferItem, OfferKind } from '../agent-page'
import type { IntakeDraft } from './types'

type OfferCollection = Pick<IntakeDraft, OfferKind>

export const PAID_NEGOTIATION_RULE_KEYS = [
  'minPrice',
  'maxDiscountPercent',
  'autoAccept',
  'autoAcceptWithinPercent',
  'autoCounter',
  'autoSettleMax',
] as const

type PaidNegotiationRuleKey = (typeof PAID_NEGOTIATION_RULE_KEYS)[number]

function rulesRecord(offer: OfferItem): Record<string, unknown> {
  const rules = offer.rules
  return rules && typeof rules === 'object' && !Array.isArray(rules)
    ? rules as Record<string, unknown>
    : {}
}

/** Only pricing/automation rules are paid. Booking, scope, and unknown rules remain core. */
export function paidNegotiationRules(offer: OfferItem): Partial<Record<PaidNegotiationRuleKey, unknown>> | null {
  const rules = rulesRecord(offer)
  const paid: Partial<Record<PaidNegotiationRuleKey, unknown>> = {}
  for (const key of PAID_NEGOTIATION_RULE_KEYS) {
    const value = rules[key]
    if (value !== undefined && value !== null) paid[key] = value
  }
  return Object.keys(paid).length ? paid : null
}

export function hasPaidNegotiationRules(offer: OfferItem): boolean {
  return paidNegotiationRules(offer) !== null
}

export function stripPaidNegotiationRules(offer: OfferItem): OfferItem {
  const next = { ...offer }
  const rules = { ...rulesRecord(offer) }
  for (const key of PAID_NEGOTIATION_RULE_KEYS) delete rules[key]
  if (Object.keys(rules).length) next.rules = rules as NonNullable<OfferItem['rules']>
  else delete next.rules
  return next
}

/** A fixed/absent posture with no paid rules is the ungated baseline. */
export function hasNegotiationConfiguration(offer: OfferItem): boolean {
  return offer.offerType === 'negotiable' || hasPaidNegotiationRules(offer)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => valuesEqual(value, right[index]))
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined).sort()
  const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key]))
}

/** Compare only the gated posture/rules contract, not ordinary offer copy. */
export function sameNegotiationConfiguration(left: OfferItem, right: OfferItem): boolean {
  const leftType = left.offerType === 'negotiable' ? 'negotiable' : 'fixed'
  const rightType = right.offerType === 'negotiable' ? 'negotiable' : 'fixed'
  return leftType === rightType && valuesEqual(paidNegotiationRules(left), paidNegotiationRules(right))
}

function normalizedName(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function offers(draft: OfferCollection): OfferItem[] {
  return [...draft.services, ...draft.products]
}

function byName(draft: OfferCollection): Map<string, OfferItem> {
  return new Map(
    offers(draft)
      .map((offer) => [normalizedName(offer.name), offer] as const)
      .filter(([name]) => Boolean(name)),
  )
}

/**
 * Return the first newly-authored or mutated negotiation configuration. A
 * downgrade may retain a byte-equivalent posture/rules contract, and an
 * explicit move to Fixed (with rules removed) is always cleanup.
 */
export function unauthorizedNegotiationMutation(
  before: OfferCollection,
  after: OfferCollection,
  renamedOffers: ReadonlyMap<string, OfferItem> = new Map(),
): OfferItem | null {
  const previous = byName(before)
  for (const offer of offers(after)) {
    if (!hasNegotiationConfiguration(offer)) continue
    const retained = previous.get(normalizedName(offer.name)) ?? renamedOffers.get(normalizedName(offer.name))
    if (!retained || !hasNegotiationConfiguration(retained) || !sameNegotiationConfiguration(retained, offer)) {
      return offer
    }
  }
  return null
}

export type NegotiationNormalization = {
  draft: IntakeDraft
  normalizedOffers: number
}

function fixedWithoutPaidRules(offer: OfferItem): OfferItem {
  return { ...stripPaidNegotiationRules(offer), offerType: 'fixed' as const }
}

function retainedConfiguration(offer: OfferItem, retained: OfferItem): OfferItem {
  const next = stripPaidNegotiationRules(offer)
  if (retained.offerType === undefined) delete next.offerType
  else next.offerType = retained.offerType
  const rules = { ...rulesRecord(next), ...(paidNegotiationRules(retained) ?? {}) }
  if (Object.keys(rules).length) next.rules = rules as NonNullable<OfferItem['rules']>
  else delete next.rules
  return next
}

/**
 * Commit-time backstop. New unauthorized negotiation configuration becomes a
 * fixed offer. For a re-interview, a forged/mutated configuration is restored
 * to the trusted page baseline instead. Explicit cleanup remains untouched.
 */
export function normalizeIntakeDraftNegotiation(
  draft: IntakeDraft,
  trustedBaseline?: OfferCollection | null,
): NegotiationNormalization {
  const baseline = trustedBaseline ? byName(trustedBaseline) : new Map<string, OfferItem>()
  let normalizedOffers = 0

  const normalize = (offer: OfferItem): OfferItem => {
    if (!hasNegotiationConfiguration(offer)) return { ...offer }
    const retained = baseline.get(normalizedName(offer.name))
    if (retained && hasNegotiationConfiguration(retained) && sameNegotiationConfiguration(retained, offer)) {
      return { ...offer, ...(offer.rules ? { rules: { ...offer.rules } } : {}) }
    }
    normalizedOffers += 1
    if (retained && hasNegotiationConfiguration(retained)) return retainedConfiguration(offer, retained)
    return fixedWithoutPaidRules(offer)
  }

  return {
    draft: {
      ...draft,
      services: draft.services.map(normalize),
      products: draft.products.map(normalize),
      faqs: draft.faqs.map((faq) => ({ ...faq })),
    },
    normalizedOffers,
  }
}
