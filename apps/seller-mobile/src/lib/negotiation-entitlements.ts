import type { OfferItem, OfferRules, OwnerPlanEntitlements } from '../types/nexez'
import { mobileIntakeNegotiationAllowed } from './intake-entitlements'

/** Keep this list in lock-step with the database negotiation projection. Booking,
 * scope, and unknown forward-compatible rules are core listing configuration. */
export const MOBILE_PAID_NEGOTIATION_RULE_KEYS = [
  'minPrice',
  'maxDiscountPercent',
  'autoAccept',
  'autoAcceptWithinPercent',
  'autoCounter',
  'autoSettleMax',
] as const satisfies readonly (keyof OfferRules)[]

/** Only an owner-bound, self-consistent authoritative snapshot can unlock paid
 * authoring. A missing/loading snapshot and collaborator-plan mismatch fail closed. */
export function mobileNegotiationAuthoringAllowed(
  value: unknown,
  ownerId: string | null | undefined,
  now: Date = new Date(),
): value is OwnerPlanEntitlements {
  return mobileIntakeNegotiationAllowed(value, ownerId, now)
}

/** Downgrade cleanup is always available. Remove only the paid posture and six
 * paid rule keys; preserve booking, scope, and unknown future core rules. */
export function clearMobilePaidNegotiationConfiguration(offer: OfferItem): OfferItem {
  const { offerType: _offerType, rules, ...coreOffer } = offer
  if (!rules) return coreOffer

  const coreRules = { ...rules } as Record<string, unknown>
  for (const key of MOBILE_PAID_NEGOTIATION_RULE_KEYS) delete coreRules[key]

  return Object.keys(coreRules).length > 0
    ? { ...coreOffer, rules: coreRules as OfferRules }
    : coreOffer
}

/** Apply the mobile listing-level auto-rule form without ever manufacturing a
 * paid key below Pro. Turning the feature off is a shrink operation on every
 * plan; turning it on requires the authoritative owner entitlement. */
export function applyMobileAutoRules(
  items: OfferItem[] | null | undefined,
  input: { enabled: boolean; floor: string; authoringAllowed: boolean },
): OfferItem[] {
  const offers = items ?? []
  if (!input.enabled) return offers.map(clearMobilePaidNegotiationConfiguration)
  if (!input.authoringAllowed) return offers

  const floor = input.floor.trim()
  return offers.map((offer) => {
    const rules: OfferRules = { ...offer.rules, autoAccept: true }
    if (floor) rules.minPrice = floor
    else delete rules.minPrice
    return { ...offer, offerType: 'negotiable', rules }
  })
}
