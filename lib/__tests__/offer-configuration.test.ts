import { describe, expect, it } from 'vitest'
import {
  sanitizeOfferAttributes,
  sanitizeOfferInputFields,
  upsertOfferAttribute,
  upsertOfferInputField,
  validateOfferAttribute,
  validateOfferInputField,
} from '../offer-configuration'

describe('offer configuration primitives', () => {
  it('validates a required select buyer input and preserves pipe characters in labels', () => {
    const result = validateOfferInputField({
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV | crossover' },
      ],
      askBuyer: 'What kind of vehicle should we detail?',
      affects: ['price', 'duration', 'price'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.options?.[1]).toEqual({ value: 'suv', label: 'SUV | crossover' })
    expect(result.value.affects).toEqual(['price', 'duration'])
  })

  it('rejects invalid keys, missing select options, and options on non-select inputs', () => {
    expect(validateOfferInputField({
      key: 'Vehicle Class',
      label: 'Vehicle class',
      valueType: 'text',
      required: true,
      askBuyer: 'Vehicle?',
    }).ok).toBe(false)

    expect(validateOfferInputField({
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      askBuyer: 'Vehicle?',
    }).ok).toBe(false)

    expect(validateOfferInputField({
      key: 'notes',
      label: 'Notes',
      valueType: 'text',
      required: false,
      options: [{ value: 'x', label: 'X' }],
      askBuyer: 'Anything else?',
    }).ok).toBe(false)
  })

  it('rejects duplicate select option values', () => {
    const result = validateOfferInputField({
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'suv', label: 'SUV' },
        { value: 'suv', label: 'Crossover' },
      ],
      askBuyer: 'Vehicle?',
    })
    expect(result.ok).toBe(false)
  })

  it('validates typed public-safe offer attributes', () => {
    expect(validateOfferAttribute({
      key: 'dietary_support',
      label: 'Dietary support',
      valueType: 'multi-select',
      value: ['vegan', 'gluten-free'],
    })).toEqual({
      ok: true,
      value: {
        key: 'dietary_support',
        label: 'Dietary support',
        valueType: 'multi-select',
        value: ['vegan', 'gluten-free'],
      },
    })

    expect(validateOfferAttribute({
      key: 'minimum_guests',
      label: 'Minimum guests',
      valueType: 'quantity',
      value: '10',
    }).ok).toBe(false)
  })

  it('sanitizers drop malformed rows and keep the last valid definition for a stable key', () => {
    const inputs = sanitizeOfferInputFields([
      { key: 'notes', label: 'Old notes', valueType: 'text', required: false, askBuyer: 'Old?' },
      { nope: true },
      { key: 'notes', label: 'Project notes', valueType: 'text', required: false, askBuyer: 'Anything we should know?' },
    ])
    expect(inputs).toHaveLength(1)
    expect(inputs[0].label).toBe('Project notes')

    const attributes = sanitizeOfferAttributes([
      { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
      { key: 'broken', label: 'Broken', valueType: 'number', value: 'yes' },
    ])
    expect(attributes).toEqual([
      { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
    ])
  })

  it('upserts by stable key without duplicating merchant schema entries', () => {
    const input = upsertOfferInputField([
      { key: 'guest_count', label: 'Guest count', valueType: 'quantity', required: true, askBuyer: 'How many guests?' },
    ], {
      key: 'guest_count',
      label: 'Number of guests',
      valueType: 'quantity',
      required: true,
      askBuyer: 'How many people should we plan for?',
      affects: ['price', 'scope'],
    })
    expect(input.ok).toBe(true)
    if (input.ok) {
      expect(input.value).toHaveLength(1)
      expect(input.value[0].label).toBe('Number of guests')
    }

    const attribute = upsertOfferAttribute([], {
      key: 'travel_included',
      label: 'Travel included',
      valueType: 'boolean',
      value: false,
    })
    expect(attribute).toEqual({
      ok: true,
      value: [{ key: 'travel_included', label: 'Travel included', valueType: 'boolean', value: false }],
    })
  })
})
