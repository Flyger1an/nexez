import type { OfferItem, OfferRules } from '../types/nexez'
import { clearMobilePaidNegotiationConfiguration } from './negotiation-entitlements'

export const MOBILE_NEGOTIATION_RULE_AUTHORING_KEYS = [
  'minPrice',
  'maxDiscountPercent',
  'autoAccept',
  'autoAcceptWithinPercent',
  'autoCounter',
  'includedScope',
  'excludedScope',
  'maxRevisions',
  'maxProjectWeeks',
] as const satisfies readonly (keyof OfferRules)[]

type MobileNegotiationRuleKey = (typeof MOBILE_NEGOTIATION_RULE_AUTHORING_KEYS)[number]

export type MobileNegotiationRuleDraft = {
  enabled: boolean
  initialEnabled: boolean
  enabledChanged: boolean
  minPrice: string
  maxDiscountPercent: string
  autoAccept: boolean
  autoAcceptWithinPercent: string
  autoCounter: boolean
  includedScope: string
  excludedScope: string
  maxRevisions: string
  maxProjectWeeks: string
}

export type MobileNegotiationRuleValidation =
  | { ok: true; rules: Pick<OfferRules, MobileNegotiationRuleKey> }
  | { ok: false; message: string }

export function mobileNegotiationRuleDraft(offer: OfferItem): MobileNegotiationRuleDraft {
  const enabled = offer.offerType === 'negotiable'
  return {
    enabled,
    initialEnabled: enabled,
    enabledChanged: false,
    minPrice: offer.rules?.minPrice ?? '',
    maxDiscountPercent: numberDraft(offer.rules?.maxDiscountPercent),
    autoAccept: offer.rules?.autoAccept === true,
    autoAcceptWithinPercent: numberDraft(offer.rules?.autoAcceptWithinPercent),
    autoCounter: offer.rules?.autoCounter === true,
    includedScope: offer.rules?.includedScope ?? '',
    excludedScope: offer.rules?.excludedScope ?? '',
    maxRevisions: numberDraft(offer.rules?.maxRevisions),
    maxProjectWeeks: numberDraft(offer.rules?.maxProjectWeeks),
  }
}

function numberDraft(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}

function optionalNumber(
  value: string,
  input: { label: string; minimum: number; maximum: number; integer?: boolean },
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: undefined }
  const parsed = Number(trimmed)
  if (
    !Number.isFinite(parsed)
    || parsed < input.minimum
    || parsed > input.maximum
    || (input.integer && !Number.isSafeInteger(parsed))
  ) {
    const unit = input.integer ? 'whole number' : 'number'
    return {
      ok: false,
      message: `${input.label} must be a ${unit} from ${input.minimum} to ${input.maximum}.`,
    }
  }
  return { ok: true, value: parsed }
}

/** Validate the same numeric boundaries enforced by the platform evaluator. */
export function validateMobileNegotiationRuleDraft(
  draft: MobileNegotiationRuleDraft,
): MobileNegotiationRuleValidation {
  const maxDiscount = optionalNumber(draft.maxDiscountPercent, {
    label: 'Maximum discount',
    minimum: 0,
    maximum: 100,
  })
  if (!maxDiscount.ok) return maxDiscount

  const autoAcceptBand = optionalNumber(draft.autoAcceptWithinPercent, {
    label: 'Auto-accept range',
    minimum: 0,
    maximum: 100,
  })
  if (!autoAcceptBand.ok) return autoAcceptBand

  const revisions = optionalNumber(draft.maxRevisions, {
    label: 'Included revisions',
    minimum: 0,
    maximum: 1_000,
    integer: true,
  })
  if (!revisions.ok) return revisions

  const projectWeeks = optionalNumber(draft.maxProjectWeeks, {
    label: 'Maximum project length',
    minimum: 1,
    maximum: 1_000,
    integer: true,
  })
  if (!projectWeeks.ok) return projectWeeks

  const minPrice = draft.minPrice.trim()
  if (minPrice && !/\d/.test(minPrice)) {
    return { ok: false, message: 'Minimum acceptable price must include a number.' }
  }

  return {
    ok: true,
    rules: {
      ...(minPrice ? { minPrice } : {}),
      ...(maxDiscount.value == null ? {} : { maxDiscountPercent: maxDiscount.value }),
      ...(draft.autoAccept ? { autoAccept: true } : {}),
      ...(autoAcceptBand.value == null ? {} : { autoAcceptWithinPercent: autoAcceptBand.value }),
      ...(draft.autoCounter ? { autoCounter: true } : {}),
      ...(draft.includedScope.trim() ? { includedScope: draft.includedScope.trim() } : {}),
      ...(draft.excludedScope.trim() ? { excludedScope: draft.excludedScope.trim() } : {}),
      ...(revisions.value == null ? {} : { maxRevisions: revisions.value }),
      ...(projectWeeks.value == null ? {} : { maxProjectWeeks: projectWeeks.value }),
    },
  }
}

const CORE_RULE_KEYS = [
  'includedScope',
  'excludedScope',
  'maxRevisions',
  'maxProjectWeeks',
] as const satisfies readonly (keyof OfferRules)[]

function mergeControlledRules(
  offer: OfferItem,
  rules: MobileNegotiationRuleValidation & { ok: true },
  keys: readonly MobileNegotiationRuleKey[],
): OfferRules | undefined {
  const merged = { ...offer.rules } as Record<string, unknown>
  for (const key of keys) delete merged[key]
  for (const key of keys) {
    const value = rules.rules[key]
    if (value !== undefined && value !== null && value !== '' && value !== false) merged[key] = value
  }
  return Object.keys(merged).length ? merged as OfferRules : undefined
}

export type ApplyMobileNegotiationRuleResult =
  | { ok: true; offer: OfferItem }
  | { ok: false; message: string }

/**
 * Apply one per-offer draft. Existing booking, settlement, integration, and
 * forward-compatible rule keys remain byte-equivalent unless the seller
 * explicitly disables negotiation, which uses the shared paid-rule cleanup.
 */
export function applyMobileNegotiationRuleDraft(
  offer: OfferItem,
  draft: MobileNegotiationRuleDraft,
  authoringAllowed: boolean,
): ApplyMobileNegotiationRuleResult {
  const validated = validateMobileNegotiationRuleDraft(draft)
  if (!validated.ok) return validated

  if (!draft.enabled && draft.enabledChanged) {
    const cleaned = clearMobilePaidNegotiationConfiguration(offer)
    const rules = mergeControlledRules(cleaned, validated, CORE_RULE_KEYS)
    return { ok: true, offer: { ...cleaned, ...(rules ? { rules } : {}) } }
  }

  if (!draft.enabled || !authoringAllowed) {
    const rules = mergeControlledRules(offer, validated, CORE_RULE_KEYS)
    return { ok: true, offer: { ...offer, ...(rules ? { rules } : {}) } }
  }

  const rules = mergeControlledRules(offer, validated, MOBILE_NEGOTIATION_RULE_AUTHORING_KEYS)
  return {
    ok: true,
    offer: {
      ...offer,
      offerType: 'negotiable',
      ...(rules ? { rules } : {}),
    },
  }
}
