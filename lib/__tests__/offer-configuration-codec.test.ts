import { describe, expect, it } from 'vitest'
import {
  OFFER_ATTRIBUTES_MARKER,
  OFFER_INPUTS_MARKER,
  formatOfferAttributesMarker,
  formatOfferInputsMarker,
  parseOfferAttributesMarker,
  parseOfferInputsMarker,
} from '../offer-configuration-codec'

describe('offer configuration legacy-line markers', () => {
  it('roundtrips buyer inputs containing the pipe delimiter safely', () => {
    const marker = formatOfferInputsMarker([
      {
        key: 'vehicle_class',
        label: 'Vehicle class',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'sedan', label: 'Sedan' },
          { value: 'suv', label: 'SUV | crossover' },
        ],
        askBuyer: 'What kind of vehicle should we detail?',
        affects: ['price', 'duration'],
      },
    ])

    expect(marker).toContain(OFFER_INPUTS_MARKER)
    expect(marker).not.toContain('SUV | crossover')
    expect(parseOfferInputsMarker(marker ?? undefined)?.[0].options?.[1].label).toBe('SUV | crossover')
  })

  it('roundtrips typed public-safe attributes', () => {
    const marker = formatOfferAttributesMarker([
      {
        key: 'dietary_support',
        label: 'Dietary support',
        valueType: 'multi-select',
        value: ['vegan', 'halal'],
      },
    ])

    expect(marker).toContain(OFFER_ATTRIBUTES_MARKER)
    expect(parseOfferAttributesMarker(marker ?? undefined)).toEqual([
      {
        key: 'dietary_support',
        label: 'Dietary support',
        valueType: 'multi-select',
        value: ['vegan', 'halal'],
      },
    ])
  })

  it('fails closed on malformed or invalid encoded payloads', () => {
    expect(parseOfferInputsMarker(`${OFFER_INPUTS_MARKER}%E0%A4%A`)).toBeUndefined()
    expect(parseOfferAttributesMarker(`${OFFER_ATTRIBUTES_MARKER}${encodeURIComponent(JSON.stringify([
      { key: 'minimum_guests', label: 'Minimum guests', valueType: 'quantity', value: 'ten' },
    ]))}`)).toBeUndefined()
  })

  it('does not emit markers when every supplied row is invalid', () => {
    expect(formatOfferInputsMarker([{ key: 'Bad Key' }])).toBeNull()
    expect(formatOfferAttributesMarker([{ nope: true }])).toBeNull()
  })
})
