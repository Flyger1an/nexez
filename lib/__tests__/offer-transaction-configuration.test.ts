import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../agent-page'
import {
  parseOfferTransactionConfigurationSnapshot,
  validateOfferTransactionConfiguration,
} from '../offer-transaction-configuration'

type ConfiguredOffer = OfferItem & { customerInputs?: unknown[] }

const configuredOffer = (): ConfiguredOffer => ({
  name: 'Mobile Detail',
  description: '',
  price: '$150',
  url: '',
  customerInputs: [
    {
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV' },
      ],
      askBuyer: 'What kind of vehicle should we detail?',
      affects: ['price', 'duration'],
    },
    {
      key: 'add_ons',
      label: 'Add-ons',
      valueType: 'multi-select',
      required: false,
      options: [
        { value: 'vacuum', label: 'Deep vacuum' },
        { value: 'wax', label: 'Hand wax' },
        { value: 'odor', label: 'Odor treatment' },
      ],
      askBuyer: 'Any add-ons?',
      affects: ['price', 'scope'],
    },
    {
      key: 'vehicle_count',
      label: 'Vehicle count',
      valueType: 'quantity',
      required: true,
      askBuyer: 'How many vehicles?',
      affects: ['price', 'duration'],
    },
    {
      key: 'mobile_ok',
      label: 'Mobile service confirmation',
      valueType: 'boolean',
      required: true,
      askBuyer: 'Can we service the vehicle at your location?',
      affects: ['eligibility'],
    },
    {
      key: 'service_date',
      label: 'Service date',
      valueType: 'date',
      required: false,
      askBuyer: 'Preferred date?',
      affects: ['availability'],
    },
    {
      key: 'notes',
      label: 'Notes',
      valueType: 'text',
      required: false,
      askBuyer: 'Anything else?',
      affects: ['scope'],
    },
  ],
})

describe('offer transaction configuration', () => {
  it('normalizes buyer values against the authoritative merchant schema', () => {
    const result = validateOfferTransactionConfiguration(configuredOffer(), {
      vehicle_class: 'suv',
      add_ons: ['wax', 'vacuum', 'wax'],
      vehicle_count: 2,
      mobile_ok: false,
      service_date: '2026-08-29',
      notes: '  Please avoid fragrance.  ',
    })

    expect(result).toEqual({
      ok: true,
      schema: expect.any(Array),
      value: {
        vehicle_class: 'suv',
        add_ons: ['vacuum', 'wax'],
        vehicle_count: 2,
        mobile_ok: false,
        service_date: '2026-08-29',
        notes: 'Please avoid fragrance.',
      },
      fulfillment: {
        schemaVersion: 1,
        policyRules: [],
        decision: 'eligible',
        matchedRuleIds: [],
        reasons: [],
      },
    })
  })

  it('treats multi-select as set-like input and canonicalizes to merchant option order', () => {
    const left = validateOfferTransactionConfiguration(configuredOffer(), {
      vehicle_class: 'sedan',
      vehicle_count: 1,
      mobile_ok: true,
      add_ons: ['wax', 'vacuum'],
    })
    const right = validateOfferTransactionConfiguration(configuredOffer(), {
      vehicle_class: 'sedan',
      vehicle_count: 1,
      mobile_ok: true,
      add_ons: ['vacuum', 'wax'],
    })

    expect(left.ok).toBe(true)
    expect(right.ok).toBe(true)
    if (!left.ok || !right.ok) return
    expect(left.value).toEqual(right.value)
    expect(left.value.add_ons).toEqual(['vacuum', 'wax'])
    expect(left.fulfillment).toEqual(right.fulfillment)
  })

  it('rejects missing required values, unknown keys, and undeclared select options together', () => {
    const result = validateOfferTransactionConfiguration(configuredOffer(), {
      vehicle_class: 'truck',
      mobile_ok: true,
      invented_discount: 'please',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'vehicle_class', code: 'invalid_value' }),
      expect.objectContaining({ key: 'vehicle_count', code: 'missing_required' }),
      expect.objectContaining({ key: 'invented_discount', code: 'unknown_field' }),
    ]))
  })

  it('requires typed values instead of coercing agent strings into numbers or booleans', () => {
    const result = validateOfferTransactionConfiguration(configuredOffer(), {
      vehicle_class: 'suv',
      vehicle_count: '2',
      mobile_ok: 'true',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'vehicle_count', code: 'invalid_type' }),
      expect.objectContaining({ key: 'mobile_ok', code: 'invalid_type' }),
    ]))
  })

  it('rejects impossible calendar dates', () => {
    const result = validateOfferTransactionConfiguration(configuredOffer(), {
      vehicle_class: 'suv',
      vehicle_count: 1,
      mobile_ok: true,
      service_date: '2026-02-31',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual(expect.objectContaining({ key: 'service_date', code: 'invalid_value' }))
  })

  it('rejects buyer configuration when the merchant declared no matching field', () => {
    const plain: OfferItem = { name: 'Consult', description: '', price: '$50', url: '' }
    const result = validateOfferTransactionConfiguration(plain, { vehicle_class: 'suv' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual(expect.objectContaining({ key: 'vehicle_class', code: 'unknown_field' }))
  })

  it('keeps legacy unconfigured checkout valid when no buyer configuration is supplied', () => {
    const plain: OfferItem = { name: 'Consult', description: '', price: '$50', url: '' }
    expect(validateOfferTransactionConfiguration(plain, undefined)).toEqual({
      ok: true,
      schema: [],
      value: {},
      fulfillment: {
        schemaVersion: 1,
        policyRules: [],
        decision: 'eligible',
        matchedRuleIds: [],
        reasons: [],
      },
    })
  })

  it('parses only bounded normalized snapshots for settlement handoff', () => {
    expect(parseOfferTransactionConfigurationSnapshot({ vehicle_class: 'suv', count: 2, mobile: false, add_ons: ['wax'] })).toEqual({
      vehicle_class: 'suv',
      count: 2,
      mobile: false,
      add_ons: ['wax'],
    })
    expect(parseOfferTransactionConfigurationSnapshot({ nested: { surprise: true } })).toBeNull()
    expect(parseOfferTransactionConfigurationSnapshot({ 'Bad Key': 'x' })).toBeNull()
  })
})