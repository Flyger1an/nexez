import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../agent-page'
import {
  formatConfiguredOfferLines,
  getOfferRecurringTerms,
  mergeProposedOfferPreservingConfiguration,
  parseConfiguredOfferLines,
  withOfferCustomerInput,
  withOfferRecurringTerms,
  type ConfiguredOfferItem,
} from '../configured-offer'

const cadenceInput = {
  key: 'cadence',
  label: 'Cadence',
  valueType: 'single-select' as const,
  required: true,
  options: [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Every other week' },
  ],
  askBuyer: 'How often should the service recur?',
  affects: ['availability' as const],
}

const baseOffer = (): ConfiguredOfferItem => ({
  name: 'Recurring clean',
  description: 'Merchant-authored recurring cleaning service.',
  price: '$120',
  url: '',
  customerInputs: [cadenceInput],
})

const recurringTerms = {
  schemaVersion: 1 as const,
  paymentModel: 'fixed-per-period' as const,
  schedule: {
    mode: 'buyer-option' as const,
    inputKey: 'cadence',
    options: [
      { value: 'weekly', cadence: { interval: 'week' as const, intervalCount: 1 } },
      { value: 'biweekly', cadence: { interval: 'week' as const, intervalCount: 2 } },
    ],
  },
  startPolicy: 'first-successful-payment' as const,
  endPolicy: 'until-cancelled' as const,
  cancellationPolicy: 'period-end' as const,
  pausePolicy: 'unsupported' as const,
}

describe('configured offers preserve merchant recurring truth', () => {
  it('round-trips recurring terms through the legacy configured-offer codec', () => {
    const applied = withOfferRecurringTerms(baseOffer(), recurringTerms)
    expect(applied.ok).toBe(true)
    if (!applied.ok) return

    const encoded = formatConfiguredOfferLines([applied.value])
    expect(encoded).toContain('[[RECURRING]]')
    const decoded = parseConfiguredOfferLines(encoded)

    expect(decoded).toHaveLength(1)
    expect(getOfferRecurringTerms(decoded[0]!)).toEqual(recurringTerms)
    expect(decoded[0]?.customerInputs).toEqual([cadenceInput])
  })

  it('drops malformed recurring markers instead of materializing invalid merchant terms', () => {
    const encoded = `${formatConfiguredOfferLines([baseOffer()])} | [[RECURRING]]${encodeURIComponent(JSON.stringify({
      ...recurringTerms,
      schedule: {
        mode: 'buyer-option',
        inputKey: 'missing-field',
        options: [{ value: 'weekly', cadence: { interval: 'week', intervalCount: 1 } }],
      },
    }))}`
    const decoded = parseConfiguredOfferLines(encoded)
    expect(getOfferRecurringTerms(decoded[0]!)).toBeNull()
  })

  it('does not let an LLM proposal invent recurring merchant terms', () => {
    const proposed = {
      ...baseOffer(),
      name: 'AI rewritten name',
      recurringTerms,
    } as unknown as OfferItem

    const merged = mergeProposedOfferPreservingConfiguration(undefined, proposed)
    expect(merged.name).toBe('AI rewritten name')
    expect(getOfferRecurringTerms(merged)).toBeNull()
  })

  it('preserves authoritative recurring terms across an LLM copy rewrite', () => {
    const applied = withOfferRecurringTerms(baseOffer(), recurringTerms)
    expect(applied.ok).toBe(true)
    if (!applied.ok) return

    const proposed = {
      ...applied.value,
      description: 'AI improved copy only.',
      recurringTerms: {
        ...recurringTerms,
        schedule: { mode: 'fixed', cadence: { interval: 'month', intervalCount: 1 } },
      },
    } as unknown as OfferItem
    const merged = mergeProposedOfferPreservingConfiguration(applied.value, proposed)

    expect(merged.description).toBe('AI improved copy only.')
    expect(getOfferRecurringTerms(merged)).toEqual(recurringTerms)
  })

  it('fails an input rewrite that would invalidate the recurring cadence mapping', () => {
    const applied = withOfferRecurringTerms(baseOffer(), recurringTerms)
    expect(applied.ok).toBe(true)
    if (!applied.ok) return

    const result = withOfferCustomerInput(applied.value, {
      ...cadenceInput,
      options: [{ value: 'weekly', label: 'Weekly' }],
    })
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('undeclared buyer option'),
    })
  })
})
