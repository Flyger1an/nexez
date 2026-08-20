import type { ConditionalFulfillmentEvaluation } from './conditional-fulfillment'
import type { OfferInputField } from './offer-configuration'
import type { OfferConfigurationPricingSnapshot } from './offer-configuration-pricing'
import type { OfferTransactionConfiguration } from './offer-transaction-configuration'

export const RECURRING_SERVICE_TERMS_VERSION = 1 as const
export const RECURRING_SERVICE_AGREEMENT_VERSION = 1 as const

export type RecurringServiceInterval = 'day' | 'week' | 'month' | 'year'

export type RecurringServiceCadence = {
  interval: RecurringServiceInterval
  intervalCount: number
}

export type RecurringServiceSchedule =
  | {
      mode: 'fixed'
      cadence: RecurringServiceCadence
    }
  | {
      mode: 'buyer-option'
      inputKey: string
      options: Array<{
        value: string
        cadence: RecurringServiceCadence
      }>
    }

/**
 * Merchant-authored recurring-service contract v1.
 *
 * Deliberately narrow:
 * - one fixed amount is charged per service period;
 * - service starts only after the first successful subscription payment;
 * - agreements run until cancelled at period end;
 * - true service pause is unsupported in v1 (Stripe pause_collection is not a
 *   semantic service pause and Stripe's true pause API is not yet a stable rail);
 * - no trials, usage metering, prorations, arbitrary recurrence expressions, or
 *   model-generated cadence decisions.
 */
export type RecurringServiceTerms = {
  schemaVersion: typeof RECURRING_SERVICE_TERMS_VERSION
  paymentModel: 'fixed-per-period'
  schedule: RecurringServiceSchedule
  startPolicy: 'first-successful-payment'
  endPolicy: 'until-cancelled'
  cancellationPolicy: 'period-end'
  pausePolicy: 'unsupported'
}

export type ResolvedRecurringServiceSchedule = RecurringServiceCadence & {
  source: 'fixed' | 'buyer-option'
  inputKey?: string
  inputValue?: string
}

export type RecurringServiceAgreementSnapshot = {
  schemaVersion: typeof RECURRING_SERVICE_AGREEMENT_VERSION
  terms: RecurringServiceTerms
  resolvedSchedule: ResolvedRecurringServiceSchedule
  configuration: OfferTransactionConfiguration
  /** Added by conditional-fulfillment runtime for new agreements; absent on legacy v1 snapshots. */
  fulfillment?: ConditionalFulfillmentEvaluation
  pricing: OfferConfigurationPricingSnapshot | null
  amountPerPeriod: number
  currency: string
}

export type RecurringServiceValidation<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; error: string; fields: string[] }

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MAX_INTERVAL_COUNT: Record<RecurringServiceInterval, number> = {
  day: 1095,
  week: 156,
  month: 36,
  year: 3,
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function cadence(value: unknown): RecurringServiceValidation<RecurringServiceCadence> {
  const record = objectRecord(value)
  if (!record || !['day', 'week', 'month', 'year'].includes(String(record.interval))) {
    return { ok: false, code: 'recurring_invalid_cadence', error: 'Recurring cadence interval must be day, week, month, or year.', fields: [] }
  }
  const interval = record.interval as RecurringServiceInterval
  if (
    typeof record.intervalCount !== 'number' ||
    !Number.isInteger(record.intervalCount) ||
    record.intervalCount < 1 ||
    record.intervalCount > MAX_INTERVAL_COUNT[interval]
  ) {
    return {
      ok: false,
      code: 'recurring_invalid_cadence',
      error: `Recurring cadence intervalCount must be a whole number between 1 and ${MAX_INTERVAL_COUNT[interval]} for ${interval}.`,
      fields: [],
    }
  }
  return { ok: true, value: { interval, intervalCount: record.intervalCount } }
}

/** Validate and normalize merchant-authored recurring terms without consulting buyer data. */
export function validateRecurringServiceTerms(value: unknown): RecurringServiceValidation<RecurringServiceTerms> {
  const record = objectRecord(value)
  if (!record) return { ok: false, code: 'recurring_terms_not_object', error: 'Recurring service terms must be an object.', fields: [] }
  if (record.schemaVersion !== RECURRING_SERVICE_TERMS_VERSION) {
    return { ok: false, code: 'recurring_terms_version', error: 'Unsupported recurring service terms schema version.', fields: [] }
  }
  if (record.paymentModel !== 'fixed-per-period') {
    return { ok: false, code: 'recurring_payment_model', error: 'Recurring service v1 only supports fixed-per-period billing.', fields: [] }
  }
  if (record.startPolicy !== 'first-successful-payment') {
    return { ok: false, code: 'recurring_start_policy', error: 'Recurring service v1 starts only after the first successful payment.', fields: [] }
  }
  if (record.endPolicy !== 'until-cancelled') {
    return { ok: false, code: 'recurring_end_policy', error: 'Recurring service v1 runs until cancelled.', fields: [] }
  }
  if (record.cancellationPolicy !== 'period-end') {
    return { ok: false, code: 'recurring_cancellation_policy', error: 'Recurring service v1 only supports cancellation at period end.', fields: [] }
  }
  if (record.pausePolicy !== 'unsupported') {
    return { ok: false, code: 'recurring_pause_policy', error: 'True service pause is unsupported in recurring service v1.', fields: [] }
  }

  const scheduleRecord = objectRecord(record.schedule)
  if (!scheduleRecord || !['fixed', 'buyer-option'].includes(String(scheduleRecord.mode))) {
    return { ok: false, code: 'recurring_schedule_mode', error: 'Recurring schedule must be fixed or buyer-option.', fields: [] }
  }

  let schedule: RecurringServiceSchedule
  if (scheduleRecord.mode === 'fixed') {
    const validated = cadence(scheduleRecord.cadence)
    if (!validated.ok) return validated
    schedule = { mode: 'fixed', cadence: validated.value }
  } else {
    if (typeof scheduleRecord.inputKey !== 'string' || !KEY_RE.test(scheduleRecord.inputKey)) {
      return { ok: false, code: 'recurring_schedule_input', error: 'Buyer-option recurring schedule needs a valid inputKey.', fields: [] }
    }
    if (!Array.isArray(scheduleRecord.options) || scheduleRecord.options.length < 1 || scheduleRecord.options.length > 25) {
      return { ok: false, code: 'recurring_schedule_options', error: 'Buyer-option recurring schedule needs between 1 and 25 mappings.', fields: [scheduleRecord.inputKey] }
    }
    const seen = new Set<string>()
    const options: Array<{ value: string; cadence: RecurringServiceCadence }> = []
    for (const raw of scheduleRecord.options) {
      const option = objectRecord(raw)
      if (!option || typeof option.value !== 'string' || !option.value.trim() || option.value.length > 120) {
        return { ok: false, code: 'recurring_schedule_options', error: 'Every recurring schedule option needs a non-empty value.', fields: [scheduleRecord.inputKey] }
      }
      const normalizedValue = option.value.trim()
      if (seen.has(normalizedValue)) {
        return { ok: false, code: 'recurring_schedule_options', error: `Duplicate recurring schedule option ${JSON.stringify(normalizedValue)}.`, fields: [scheduleRecord.inputKey] }
      }
      const validated = cadence(option.cadence)
      if (!validated.ok) return { ...validated, fields: [scheduleRecord.inputKey] }
      seen.add(normalizedValue)
      options.push({ value: normalizedValue, cadence: validated.value })
    }
    schedule = { mode: 'buyer-option', inputKey: scheduleRecord.inputKey, options }
  }

  return {
    ok: true,
    value: {
      schemaVersion: RECURRING_SERVICE_TERMS_VERSION,
      paymentModel: 'fixed-per-period',
      schedule,
      startPolicy: 'first-successful-payment',
      endPolicy: 'until-cancelled',
      cancellationPolicy: 'period-end',
      pausePolicy: 'unsupported',
    },
  }
}

/**
 * Validate that buyer-option recurrence is backed by one required merchant
 * single-select input and that every mapped value is actually declared there.
 */
export function validateRecurringServiceTermsForInputs(
  terms: RecurringServiceTerms,
  customerInputs: OfferInputField[],
): RecurringServiceValidation<RecurringServiceTerms> {
  if (terms.schedule.mode === 'fixed') return { ok: true, value: terms }
  const schedule = terms.schedule
  const field = customerInputs.find((entry) => entry.key === schedule.inputKey)
  if (!field || field.valueType !== 'single-select' || !field.required) {
    return {
      ok: false,
      code: 'recurring_schedule_input_contract',
      error: 'Buyer-option recurrence must reference one required merchant single-select input.',
      fields: [schedule.inputKey],
    }
  }
  const declared = new Set((field.options ?? []).map((option) => option.value))
  for (const option of schedule.options) {
    if (!declared.has(option.value)) {
      return {
        ok: false,
        code: 'recurring_schedule_input_contract',
        error: `Recurring cadence maps undeclared buyer option ${JSON.stringify(option.value)}.`,
        fields: [schedule.inputKey],
      }
    }
  }
  return { ok: true, value: terms }
}

export function resolveRecurringServiceSchedule(
  terms: RecurringServiceTerms,
  configuration: OfferTransactionConfiguration,
): RecurringServiceValidation<ResolvedRecurringServiceSchedule> {
  if (terms.schedule.mode === 'fixed') {
    return { ok: true, value: { ...terms.schedule.cadence, source: 'fixed' } }
  }
  const selected = configuration[terms.schedule.inputKey]
  if (typeof selected !== 'string') {
    return {
      ok: false,
      code: 'recurring_schedule_unresolved',
      error: 'Recurring cadence cannot be resolved until the buyer selects a declared cadence option.',
      fields: [terms.schedule.inputKey],
    }
  }
  const mapped = terms.schedule.options.find((option) => option.value === selected)
  if (!mapped) {
    return {
      ok: false,
      code: 'recurring_schedule_unresolved',
      error: 'Buyer cadence selection has no merchant-authored recurring schedule mapping.',
      fields: [terms.schedule.inputKey],
    }
  }
  return {
    ok: true,
    value: {
      ...mapped.cadence,
      source: 'buyer-option',
      inputKey: terms.schedule.inputKey,
      inputValue: selected,
    },
  }
}

export function buildRecurringServiceAgreementSnapshot(input: {
  terms: RecurringServiceTerms
  configuration: OfferTransactionConfiguration
  fulfillment?: ConditionalFulfillmentEvaluation
  pricing: OfferConfigurationPricingSnapshot | null
  amountPerPeriod: number
  currency: string
}): RecurringServiceValidation<RecurringServiceAgreementSnapshot> {
  if (!Number.isSafeInteger(input.amountPerPeriod) || input.amountPerPeriod <= 0) {
    return { ok: false, code: 'recurring_amount_invalid', error: 'Recurring service requires a positive fixed amount per period.', fields: [] }
  }
  const currency = input.currency.trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(currency)) {
    return { ok: false, code: 'recurring_currency_invalid', error: 'Recurring service requires a normalized three-letter currency.', fields: [] }
  }
  if (input.pricing && (input.pricing.finalAmount !== input.amountPerPeriod || input.pricing.currency !== currency)) {
    return {
      ok: false,
      code: 'recurring_pricing_mismatch',
      error: 'Recurring agreement amount/currency must match the approved deterministic pricing snapshot.',
      fields: [],
    }
  }
  if (input.fulfillment && input.fulfillment.decision !== 'eligible') {
    return {
      ok: false,
      code: input.fulfillment.decision === 'requires-review' ? 'fulfillment_review_required' : 'fulfillment_ineligible',
      error: input.fulfillment.reasons[0]?.message ?? 'This buyer configuration is not eligible for automatic recurring checkout.',
      fields: input.fulfillment.reasons.map((reason) => reason.inputKey),
    }
  }
  const resolved = resolveRecurringServiceSchedule(input.terms, input.configuration)
  if (!resolved.ok) return resolved
  return {
    ok: true,
    value: {
      schemaVersion: RECURRING_SERVICE_AGREEMENT_VERSION,
      terms: input.terms,
      resolvedSchedule: resolved.value,
      configuration: { ...input.configuration },
      ...(input.fulfillment ? { fulfillment: JSON.parse(JSON.stringify(input.fulfillment)) } : {}),
      pricing: input.pricing ? JSON.parse(JSON.stringify(input.pricing)) : null,
      amountPerPeriod: input.amountPerPeriod,
      currency,
    },
  }
}