import type { OfferItem } from './agent-page'
import { parseMoney } from './checkout'
import { getOfferCustomerInputs, getOfferRecurringTerms } from './configured-offer'
import { isZeroDecimalCurrency, normalizeCurrency, toStripeAmount } from './currency'
import type { OfferInputPricing } from './offer-configuration'
import type {
  OfferTransactionConfiguration,
  OfferTransactionConfigurationValue,
} from './offer-transaction-configuration'

export const OFFER_PRICING_SNAPSHOT_VERSION = 1 as const

export type OfferConfigurationPricingAdjustment = {
  fieldKey: string
  label: string
  value: OfferTransactionConfigurationValue
  model: OfferInputPricing['model']
  /** Exact normalized merchant rule evaluated for this field. */
  rule: OfferInputPricing
  /** Signed Stripe-smallest-unit delta contributed by this field. */
  amount: number
}

export type OfferConfigurationPricingSnapshot = {
  schemaVersion: typeof OFFER_PRICING_SNAPSHOT_VERSION
  currency: string
  /** Base listed offer amount in Stripe smallest units. */
  baseAmount: number
  adjustments: OfferConfigurationPricingAdjustment[]
  adjustmentAmount: number
  /** Exact amount checkout must charge in Stripe smallest units. */
  finalAmount: number
}

export type OfferConfigurationPricingErrorCode =
  | 'pricing_base_unavailable'
  | 'pricing_rule_unresolved'
  | 'pricing_currency_precision'
  | 'pricing_amount_overflow'
  | 'pricing_total_invalid'
  | 'recurring_checkout_required'

export type OfferConfigurationPricingResult =
  | {
      ok: true
      /** Base amount for legacy checkout; exact configured amount when configuration exists. */
      amountCents: number
      pricing: OfferConfigurationPricingSnapshot | null
    }
  | {
      ok: false
      code: OfferConfigurationPricingErrorCode
      error: string
      fields: string[]
    }

type DeltaResult =
  | { ok: true; amount: number }
  | { ok: false; code: 'pricing_currency_precision' | 'pricing_amount_overflow'; error: string }

function supplied(configuration: OfferTransactionConfiguration, key: string) {
  return Object.prototype.hasOwnProperty.call(configuration, key)
}

function signedSmallestUnit(delta: string, currency: string): DeltaResult {
  const negative = delta.startsWith('-')
  const unsigned = negative ? delta.slice(1) : delta
  const [wholeText, fractionText = ''] = unsigned.split('.')
  const whole = Number(wholeText)

  if (isZeroDecimalCurrency(currency)) {
    if (fractionText && /[1-9]/.test(fractionText)) {
      return {
        ok: false,
        code: 'pricing_currency_precision',
        error: `Pricing delta ${JSON.stringify(delta)} uses fractional units, but ${currency.toUpperCase()} is a zero-decimal currency.`,
      }
    }
    if (!Number.isSafeInteger(whole)) {
      return { ok: false, code: 'pricing_amount_overflow', error: 'Pricing delta exceeds the safe integer range.' }
    }
    return { ok: true, amount: (negative ? -1 : 1) * whole }
  }

  const fraction = Number(fractionText.padEnd(2, '0') || '0')
  const smallest = whole * 100 + fraction
  if (!Number.isSafeInteger(smallest)) {
    return { ok: false, code: 'pricing_amount_overflow', error: 'Pricing delta exceeds the safe integer range.' }
  }
  return { ok: true, amount: (negative ? -1 : 1) * smallest }
}

function optionDelta(rule: Extract<OfferInputPricing, { model: 'option-delta' }>, value: string | string[], currency: string): DeltaResult {
  const byValue = new Map(rule.adjustments.map((adjustment) => [adjustment.value, adjustment.delta] as const))
  const selected = Array.isArray(value) ? value : [value]
  let amount = 0

  for (const option of selected) {
    const delta = byValue.get(option)
    if (delta == null) continue
    const converted = signedSmallestUnit(delta, currency)
    if (!converted.ok) return converted
    amount += converted.amount
    if (!Number.isSafeInteger(amount)) {
      return { ok: false, code: 'pricing_amount_overflow', error: 'Combined option pricing exceeds the safe integer range.' }
    }
  }

  return { ok: true, amount }
}

function booleanDelta(rule: Extract<OfferInputPricing, { model: 'boolean-delta' }>, value: boolean, currency: string): DeltaResult {
  const delta = value ? rule.trueDelta : rule.falseDelta
  if (delta == null) return { ok: true, amount: 0 }
  return signedSmallestUnit(delta, currency)
}

function quantityDelta(rule: Extract<OfferInputPricing, { model: 'quantity-delta' }>, value: number, currency: string): DeltaResult {
  const unit = signedSmallestUnit(rule.unitDelta, currency)
  if (!unit.ok) return unit
  const billableUnits = Math.max(0, value - rule.includedQuantity)
  const amount = unit.amount * billableUnits
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, code: 'pricing_amount_overflow', error: 'Quantity pricing exceeds the safe integer range.' }
  }
  return { ok: true, amount }
}

function adjustmentForRule(
  pricing: OfferInputPricing,
  value: OfferTransactionConfigurationValue,
  currency: string,
): DeltaResult {
  if (pricing.model === 'option-delta') {
    return optionDelta(pricing, value as string | string[], currency)
  }
  if (pricing.model === 'boolean-delta') {
    return booleanDelta(pricing, value as boolean, currency)
  }
  return quantityDelta(pricing, value as number, currency)
}

function pricingSnapshot(
  currency: string,
  baseAmount: number,
  adjustments: OfferConfigurationPricingAdjustment[],
  adjustmentAmount: number,
): OfferConfigurationPricingSnapshot {
  return {
    schemaVersion: OFFER_PRICING_SNAPSHOT_VERSION,
    currency,
    baseAmount,
    adjustments,
    adjustmentAmount,
    finalAmount: baseAmount + adjustmentAmount,
  }
}

/**
 * Price a normalized buyer configuration using only merchant-authored rules.
 * No LLM, no arbitrary formulas, no network reads, and no mutation.
 *
 * By default this is the one-time settlement rail. An offer carrying validated
 * recurring-service terms fails closed here unless a caller explicitly opts into
 * recurring settlement; this prevents an ordinary checkout path from silently
 * charging one period of a recurring contract as a one-off purchase.
 */
export function priceOfferConfiguration(
  offer: OfferItem,
  configuration: OfferTransactionConfiguration,
  currencyInput: string | null | undefined,
  options: { settlementMode?: 'one-time' | 'recurring' } = {},
): OfferConfigurationPricingResult {
  const settlementMode = options.settlementMode ?? 'one-time'
  if (settlementMode === 'one-time' && getOfferRecurringTerms(offer)) {
    return {
      ok: false,
      code: 'recurring_checkout_required',
      error: 'This offer is a recurring service and must use the recurring agreement checkout rail.',
      fields: [],
    }
  }

  const currency = normalizeCurrency(currencyInput)
  const baseMajor = parseMoney(offer.price)
  const baseAmount = baseMajor == null ? 0 : toStripeAmount(baseMajor, currency)
  const fields = getOfferCustomerInputs(offer)
  const hasConfiguration = Object.keys(configuration).length > 0
  const priceFields = fields.filter((field) => field.affects?.includes('price') && supplied(configuration, field.key))

  // Preserve byte-compatible legacy behavior only when there is no buyer
  // configuration at all. Configured checkout needs a positive base price so its
  // quote can be approval-bound even when the selected values add $0.
  if (!hasConfiguration && !priceFields.length) {
    return { ok: true, amountCents: baseAmount, pricing: null }
  }

  if (!baseAmount) {
    return {
      ok: false,
      code: 'pricing_base_unavailable',
      error: 'Configured checkout requires a positive parseable base offer price.',
      fields: priceFields.length ? priceFields.map((field) => field.key) : Object.keys(configuration),
    }
  }

  const unresolved = priceFields.filter((field) => !field.pricing).map((field) => field.key)
  if (unresolved.length) {
    return {
      ok: false,
      code: 'pricing_rule_unresolved',
      error: 'One or more supplied price-affecting fields do not have a deterministic merchant-authored pricing rule.',
      fields: unresolved,
    }
  }

  const adjustments: OfferConfigurationPricingAdjustment[] = []
  let adjustmentAmount = 0

  for (const field of priceFields) {
    const value = configuration[field.key]
    const pricing = field.pricing as OfferInputPricing
    const result = adjustmentForRule(pricing, value, currency)
    if (!result.ok) {
      return { ok: false, code: result.code, error: result.error, fields: [field.key] }
    }

    adjustmentAmount += result.amount
    if (!Number.isSafeInteger(adjustmentAmount)) {
      return {
        ok: false,
        code: 'pricing_amount_overflow',
        error: 'Combined configuration pricing exceeds the safe integer range.',
        fields: priceFields.map((entry) => entry.key),
      }
    }

    adjustments.push({
      fieldKey: field.key,
      label: field.label,
      value: Array.isArray(value) ? [...value] : value,
      model: pricing.model,
      rule: pricing,
      amount: result.amount,
    })
  }

  const snapshot = pricingSnapshot(currency, baseAmount, adjustments, adjustmentAmount)
  if (!Number.isSafeInteger(snapshot.finalAmount)) {
    return {
      ok: false,
      code: 'pricing_amount_overflow',
      error: 'Final configured price exceeds the safe integer range.',
      fields: priceFields.map((field) => field.key),
    }
  }
  if (snapshot.finalAmount <= 0) {
    return {
      ok: false,
      code: 'pricing_total_invalid',
      error: 'Deterministic configuration pricing must produce a positive final checkout amount.',
      fields: priceFields.map((field) => field.key),
    }
  }

  return {
    ok: true,
    amountCents: snapshot.finalAmount,
    pricing: snapshot,
  }
}