import { describe, expect, it } from 'vitest'
import type { OfferInputField } from './offer-configuration'
import {
  buildRecurringServiceAgreementSnapshot,
  resolveRecurringServiceSchedule,
  validateRecurringServiceTerms,
  validateRecurringServiceTermsForInputs,
  type RecurringServiceTerms,
} from './recurring-service'

const buyerCadenceField: OfferInputField = {
  key: 'cadence',
  label: 'Cadence',
  valueType: 'single-select',
  required: true,
  options: [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Every other week' },
  ],
  askBuyer: 'How often should the service recur?',
  affects: ['availability'],
}

const terms: RecurringServiceTerms = {
  schemaVersion: 1,
  paymentModel: 'fixed-per-period',
  schedule: {
    mode: 'buyer-option',
    inputKey: 'cadence',
    options: [
      { value: 'weekly', cadence: { interval: 'week', intervalCount: 1 } },
      { value: 'biweekly', cadence: { interval: 'week', intervalCount: 2 } },
    ],
  },
  startPolicy: 'first-successful-payment',
  endPolicy: 'until-cancelled',
  cancellationPolicy: 'period-end',
  pausePolicy: 'unsupported',
}

describe('recurring service contract', () => {
  it('normalizes fixed recurring terms', () => {
    expect(validateRecurringServiceTerms({
      schemaVersion: 1,
      paymentModel: 'fixed-per-period',
      schedule: { mode: 'fixed', cadence: { interval: 'month', intervalCount: 1 } },
      startPolicy: 'first-successful-payment',
      endPolicy: 'until-cancelled',
      cancellationPolicy: 'period-end',
      pausePolicy: 'unsupported',
      ignored: 'not copied',
    })).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        paymentModel: 'fixed-per-period',
        schedule: { mode: 'fixed', cadence: { interval: 'month', intervalCount: 1 } },
        startPolicy: 'first-successful-payment',
        endPolicy: 'until-cancelled',
        cancellationPolicy: 'period-end',
        pausePolicy: 'unsupported',
      },
    })
  })

  it('rejects unsupported pause semantics and overlong cadences', () => {
    expect(validateRecurringServiceTerms({ ...terms, pausePolicy: 'void-invoices' }).ok).toBe(false)
    expect(validateRecurringServiceTerms({
      ...terms,
      schedule: { mode: 'fixed', cadence: { interval: 'month', intervalCount: 37 } },
    }).ok).toBe(false)
  })

  it('requires buyer-option cadence to point at a required merchant single-select', () => {
    expect(validateRecurringServiceTermsForInputs(terms, [buyerCadenceField]).ok).toBe(true)
    expect(validateRecurringServiceTermsForInputs(terms, [{ ...buyerCadenceField, required: false }])).toMatchObject({
      ok: false,
      code: 'recurring_schedule_input_contract',
      fields: ['cadence'],
    })
  })

  it('rejects mappings for values the merchant input did not declare', () => {
    const invalid: RecurringServiceTerms = {
      ...terms,
      schedule: {
        mode: 'buyer-option',
        inputKey: 'cadence',
        options: [
          { value: 'weekly', cadence: { interval: 'week', intervalCount: 1 } },
          { value: 'monthly', cadence: { interval: 'month', intervalCount: 1 } },
        ],
      },
    }
    expect(validateRecurringServiceTermsForInputs(invalid, [buyerCadenceField])).toMatchObject({
      ok: false,
      code: 'recurring_schedule_input_contract',
      fields: ['cadence'],
    })
  })

  it('resolves buyer-selected cadence only from the normalized configuration', () => {
    expect(resolveRecurringServiceSchedule(terms, { cadence: 'biweekly' })).toEqual({
      ok: true,
      value: {
        interval: 'week',
        intervalCount: 2,
        source: 'buyer-option',
        inputKey: 'cadence',
        inputValue: 'biweekly',
      },
    })
    expect(resolveRecurringServiceSchedule(terms, {})).toMatchObject({
      ok: false,
      code: 'recurring_schedule_unresolved',
      fields: ['cadence'],
    })
  })

  it('binds the resolved schedule, buyer configuration, and exact per-period pricing into one snapshot', () => {
    const result = buildRecurringServiceAgreementSnapshot({
      terms,
      configuration: { cadence: 'weekly', 'add-ons': ['oven'] },
      amountPerPeriod: 15000,
      currency: 'USD',
      pricing: {
        schemaVersion: 1,
        currency: 'usd',
        baseAmount: 12000,
        adjustments: [{
          fieldKey: 'add-ons',
          label: 'Add-ons',
          value: ['oven'],
          model: 'option-delta',
          rule: { model: 'option-delta', adjustments: [{ value: 'oven', delta: '30' }] },
          amount: 3000,
        }],
        adjustmentAmount: 3000,
        finalAmount: 15000,
      },
    })
    expect(result).toMatchObject({
      ok: true,
      value: {
        schemaVersion: 1,
        resolvedSchedule: { interval: 'week', intervalCount: 1, source: 'buyer-option', inputValue: 'weekly' },
        amountPerPeriod: 15000,
        currency: 'usd',
      },
    })
  })

  it('fails closed when the recurring amount drifts from deterministic pricing', () => {
    expect(buildRecurringServiceAgreementSnapshot({
      terms,
      configuration: { cadence: 'weekly' },
      amountPerPeriod: 15000,
      currency: 'usd',
      pricing: {
        schemaVersion: 1,
        currency: 'usd',
        baseAmount: 12000,
        adjustments: [],
        adjustmentAmount: 0,
        finalAmount: 12000,
      },
    })).toMatchObject({ ok: false, code: 'recurring_pricing_mismatch' })
  })

  it('is JSON-safe', () => {
    const result = buildRecurringServiceAgreementSnapshot({
      terms,
      configuration: { cadence: 'weekly' },
      amountPerPeriod: 12000,
      currency: 'usd',
      pricing: null,
    })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})