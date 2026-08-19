import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../agent-page'
import { validateOfferInputField } from '../offer-configuration'
import { priceOfferConfiguration } from '../offer-configuration-pricing'

const offer = (customerInputs: any[], price = '$150'): OfferItem => ({
  name: 'Configured service',
  description: '',
  price,
  url: '',
  customerInputs,
} as OfferItem)

describe('OfferInputPricing validation', () => {
  it('normalizes a merchant-authored select delta and requires price provenance', () => {
    const result = validateOfferInputField({
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV' },
      ],
      askBuyer: 'What kind of vehicle?',
      affects: ['price', 'duration'],
      pricing: {
        model: 'option-delta',
        adjustments: [{ value: 'suv', delta: '025.00' }],
      },
    })

    expect(result.ok).toBe(false)

    const valid = validateOfferInputField({
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV' },
      ],
      askBuyer: 'What kind of vehicle?',
      affects: ['price', 'duration'],
      pricing: {
        model: 'option-delta',
        adjustments: [{ value: 'suv', delta: '25.00' }],
      },
    })

    expect(valid).toMatchObject({
      ok: true,
      value: {
        pricing: {
          model: 'option-delta',
          adjustments: [{ value: 'suv', delta: '25' }],
        },
      },
    })
  })

  it('rejects pricing that is inconsistent with the input schema', () => {
    const wrongModel = validateOfferInputField({
      key: 'guest_count', label: 'Guests', valueType: 'quantity', required: true,
      askBuyer: 'How many guests?', affects: ['price'],
      pricing: { model: 'option-delta', adjustments: [{ value: '10', delta: '20' }] },
    })
    expect(wrongModel.ok).toBe(false)

    const undeclaredOption = validateOfferInputField({
      key: 'vehicle_class', label: 'Vehicle class', valueType: 'single-select', required: true,
      options: [{ value: 'sedan', label: 'Sedan' }], askBuyer: 'Vehicle?', affects: ['price'],
      pricing: { model: 'option-delta', adjustments: [{ value: 'suv', delta: '25' }] },
    })
    expect(undeclaredOption.ok).toBe(false)

    const missingAffects = validateOfferInputField({
      key: 'stairs', label: 'Stairs', valueType: 'boolean', required: false,
      askBuyer: 'Are there stairs?',
      pricing: { model: 'boolean-delta', trueDelta: '10' },
    })
    expect(missingAffects.ok).toBe(false)
  })
})

describe('priceOfferConfiguration', () => {
  it('prices single-select choices from the listed base price', () => {
    const priced = priceOfferConfiguration(
      offer([{
        key: 'vehicle_class', label: 'Vehicle class', valueType: 'single-select', required: true,
        options: [{ value: 'sedan', label: 'Sedan' }, { value: 'suv', label: 'SUV' }],
        askBuyer: 'Vehicle?', affects: ['price'],
        pricing: { model: 'option-delta', adjustments: [{ value: 'suv', delta: '25' }] },
      }]),
      { vehicle_class: 'suv' },
      'usd',
    )

    expect(priced).toMatchObject({
      ok: true,
      amountCents: 17500,
      pricing: {
        currency: 'usd',
        baseAmount: 15000,
        adjustmentAmount: 2500,
        finalAmount: 17500,
      },
    })
  })

  it('adds multi-select option deltas in the normalized buyer selection', () => {
    const priced = priceOfferConfiguration(
      offer([{
        key: 'add_ons', label: 'Add-ons', valueType: 'multi-select', required: false,
        options: [
          { value: 'wax', label: 'Wax' },
          { value: 'pet_hair', label: 'Pet hair' },
          { value: 'vacuum', label: 'Vacuum' },
        ],
        askBuyer: 'Any add-ons?', affects: ['price'],
        pricing: {
          model: 'option-delta',
          adjustments: [
            { value: 'wax', delta: '15' },
            { value: 'pet_hair', delta: '20' },
          ],
        },
      }]),
      { add_ons: ['wax', 'pet_hair', 'vacuum'] },
      'usd',
    )

    expect(priced.ok && priced.pricing?.adjustmentAmount).toBe(3500)
    expect(priced.ok && priced.amountCents).toBe(18500)
  })

  it('supports boolean and quantity deltas without arbitrary formulas', () => {
    const priced = priceOfferConfiguration(
      offer([
        {
          key: 'stairs', label: 'Stairs', valueType: 'boolean', required: false,
          askBuyer: 'Stairs?', affects: ['price'],
          pricing: { model: 'boolean-delta', trueDelta: '10' },
        },
        {
          key: 'bedrooms', label: 'Bedrooms', valueType: 'quantity', required: true,
          askBuyer: 'Bedrooms?', affects: ['price'],
          pricing: { model: 'quantity-delta', unitDelta: '20', includedQuantity: 2 },
        },
      ]),
      { stairs: true, bedrooms: 4 },
      'usd',
    )

    expect(priced.ok && priced.pricing?.adjustmentAmount).toBe(5000)
    expect(priced.ok && priced.amountCents).toBe(20000)
  })

  it('supports merchant-declared negative deltas while refusing a non-positive final amount', () => {
    const discount = priceOfferConfiguration(
      offer([{
        key: 'plan', label: 'Plan', valueType: 'single-select', required: true,
        options: [{ value: 'one_time', label: 'One time' }, { value: 'recurring', label: 'Recurring' }],
        askBuyer: 'Plan?', affects: ['price'],
        pricing: { model: 'option-delta', adjustments: [{ value: 'recurring', delta: '-15' }] },
      }]),
      { plan: 'recurring' },
      'usd',
    )
    expect(discount.ok && discount.amountCents).toBe(13500)

    const invalid = priceOfferConfiguration(
      offer([{
        key: 'plan', label: 'Plan', valueType: 'single-select', required: true,
        options: [{ value: 'promo', label: 'Promo' }], askBuyer: 'Plan?', affects: ['price'],
        pricing: { model: 'option-delta', adjustments: [{ value: 'promo', delta: '-150' }] },
      }]),
      { plan: 'promo' },
      'usd',
    )
    expect(invalid).toMatchObject({ ok: false, code: 'pricing_total_invalid' })
  })

  it('fails closed when a supplied price-affecting field has no deterministic rule', () => {
    const result = priceOfferConfiguration(
      offer([{
        key: 'vehicle_class', label: 'Vehicle class', valueType: 'single-select', required: true,
        options: [{ value: 'suv', label: 'SUV' }], askBuyer: 'Vehicle?', affects: ['price'],
      }]),
      { vehicle_class: 'suv' },
      'usd',
    )
    expect(result).toMatchObject({ ok: false, code: 'pricing_rule_unresolved', fields: ['vehicle_class'] })
  })

  it('rejects fractional pricing deltas for zero-decimal currencies instead of rounding money silently', () => {
    const result = priceOfferConfiguration(
      offer([{
        key: 'vehicle_class', label: 'Vehicle class', valueType: 'single-select', required: true,
        options: [{ value: 'suv', label: 'SUV' }], askBuyer: 'Vehicle?', affects: ['price'],
        pricing: { model: 'option-delta', adjustments: [{ value: 'suv', delta: '25.5' }] },
      }], '¥1500'),
      { vehicle_class: 'suv' },
      'jpy',
    )
    expect(result).toMatchObject({ ok: false, code: 'pricing_currency_precision', fields: ['vehicle_class'] })
  })

  it('binds the listed base amount for configured values that add no price adjustment', () => {
    const result = priceOfferConfiguration(
      offer([{
        key: 'notes', label: 'Notes', valueType: 'text', required: false,
        askBuyer: 'Notes?', affects: ['scope'],
      }]),
      { notes: 'No fragrance' },
      'usd',
    )
    expect(result).toMatchObject({
      ok: true,
      amountCents: 15000,
      pricing: {
        currency: 'usd',
        baseAmount: 15000,
        adjustments: [],
        adjustmentAmount: 0,
        finalAmount: 15000,
      },
    })
  })

  it('keeps truly unconfigured legacy checkout free of pricing provenance', () => {
    const result = priceOfferConfiguration(offer([]), {}, 'usd')
    expect(result).toEqual({ ok: true, amountCents: 15000, pricing: null })
  })

  it('fails closed when a recurring offer is sent through the one-time settlement rail', () => {
    const recurring = {
      ...offer([], '$120'),
      recurringTerms: {
        schemaVersion: 1,
        paymentModel: 'fixed-per-period',
        schedule: { mode: 'fixed', cadence: { interval: 'week', intervalCount: 1 } },
        startPolicy: 'first-successful-payment',
        endPolicy: 'until-cancelled',
        cancellationPolicy: 'period-end',
        pausePolicy: 'unsupported',
      },
    } as OfferItem

    expect(priceOfferConfiguration(recurring, {}, 'usd')).toEqual({
      ok: false,
      code: 'recurring_checkout_required',
      error: 'This offer is a recurring service and must use the recurring agreement checkout rail.',
      fields: [],
    })
  })

  it('prices the same recurring offer only when the caller explicitly opts into recurring settlement', () => {
    const recurring = {
      ...offer([], '$120'),
      recurringTerms: {
        schemaVersion: 1,
        paymentModel: 'fixed-per-period',
        schedule: { mode: 'fixed', cadence: { interval: 'week', intervalCount: 1 } },
        startPolicy: 'first-successful-payment',
        endPolicy: 'until-cancelled',
        cancellationPolicy: 'period-end',
        pausePolicy: 'unsupported',
      },
    } as OfferItem

    expect(priceOfferConfiguration(recurring, {}, 'usd', { settlementMode: 'recurring' })).toEqual({
      ok: true,
      amountCents: 12000,
      pricing: null,
    })
  })
})