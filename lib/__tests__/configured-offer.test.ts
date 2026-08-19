import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../agent-page'
import {
  formatConfiguredOfferLines,
  getOfferAttributes,
  getOfferCustomerInputs,
  mergeProposedOfferPreservingConfiguration,
  parseConfiguredOfferLines,
  withOfferAttribute,
  withOfferCustomerInput,
  type ConfiguredOfferItem,
} from '../configured-offer'

function baseOffer(overrides: Partial<OfferItem> = {}): OfferItem {
  return {
    name: 'Mobile Detail',
    description: 'Interior and exterior detail',
    price: '$180',
    url: 'https://example.com/detail',
    ...overrides,
  }
}

describe('configured offer adapter', () => {
  it('roundtrips structured configuration without corrupting legacy consumer fields', () => {
    const offer: ConfiguredOfferItem = {
      ...baseOffer(),
      customerInputs: [
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
      ],
      attributes: [
        { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
      ],
    }

    const encoded = formatConfiguredOfferLines([offer])
    const decoded = parseConfiguredOfferLines(encoded)[0]

    expect(encoded).toContain('[[INPUTS]]')
    expect(encoded).toContain('[[ATTRIBUTES]]')
    expect(encoded).not.toContain('SUV | crossover')
    expect(decoded.duration).toBeUndefined()
    expect(decoded.serviceArea).toBeUndefined()
    expect(decoded.customerInputs?.[0].options?.[1].label).toBe('SUV | crossover')
    expect(decoded.attributes).toEqual([
      { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
    ])
  })

  it('keeps existing legacy fields, tiers, and smart rules alongside configuration markers', () => {
    const offer: ConfiguredOfferItem = {
      ...baseOffer({
        duration: '2 hours',
        serviceArea: 'Dallas-Fort Worth',
        isMobile: true,
        tiers: [{ name: 'SUV', price: '$220' }],
        offerType: 'negotiable',
        rules: { minNoticeHours: 12, maxRevisions: 1 },
      }),
      customerInputs: [
        { key: 'notes', label: 'Vehicle notes', valueType: 'text', required: false, askBuyer: 'Anything we should know?' },
      ],
    }

    const decoded = parseConfiguredOfferLines(formatConfiguredOfferLines([offer]))[0]
    expect(decoded.duration).toBe('2 hours')
    expect(decoded.serviceArea).toBe('Dallas-Fort Worth')
    expect(decoded.isMobile).toBe(true)
    expect(decoded.tiers).toEqual([{ name: 'SUV', price: '$220' }])
    expect(decoded.offerType).toBe('negotiable')
    expect(decoded.rules).toEqual({ minNoticeHours: 12, maxRevisions: 1 })
    expect(decoded.customerInputs?.[0].key).toBe('notes')
  })

  it('fails closed on malformed configuration while preserving the base offer', () => {
    const encoded = `${formatConfiguredOfferLines([baseOffer() as ConfiguredOfferItem])} | [[INPUTS]]%E0%A4%A`
    const decoded = parseConfiguredOfferLines(encoded)[0]

    expect(decoded.name).toBe('Mobile Detail')
    expect(decoded.customerInputs).toBeUndefined()
    expect(decoded.duration).toBeUndefined()
  })

  it('never lets an LLM proposal create or overwrite merchant configuration', () => {
    const existing = {
      ...baseOffer(),
      customerInputs: [
        { key: 'vehicle_class', label: 'Vehicle class', valueType: 'text', required: true, askBuyer: 'Vehicle class?' },
      ],
      attributes: [
        { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
      ],
    } as ConfiguredOfferItem

    const maliciousProposal = {
      ...baseOffer({ price: '$160', description: 'Curated description' }),
      customerInputs: [
        { key: 'invented', label: 'Invented', valueType: 'text', required: true, askBuyer: 'Invented?' },
      ],
      attributes: [
        { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: false },
      ],
    } as unknown as OfferItem

    const merged = mergeProposedOfferPreservingConfiguration(existing, maliciousProposal)

    expect(merged.price).toBe('$160')
    expect(merged.description).toBe('Curated description')
    expect(merged.customerInputs?.map((field) => field.key)).toEqual(['vehicle_class'])
    expect(merged.attributes).toEqual([
      { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
    ])
  })

  it('adds merchant-confirmed configuration through validated stable-key upserts', () => {
    const inputResult = withOfferCustomerInput(baseOffer(), {
      key: 'guest_count',
      label: 'Guest count',
      valueType: 'quantity',
      required: true,
      askBuyer: 'How many guests?',
      affects: ['price', 'scope'],
    })
    expect(inputResult.ok).toBe(true)
    if (!inputResult.ok) return

    const attributeResult = withOfferAttribute(inputResult.value, {
      key: 'minimum_guests',
      label: 'Minimum guests',
      valueType: 'quantity',
      value: 8,
    })
    expect(attributeResult.ok).toBe(true)
    if (!attributeResult.ok) return

    expect(getOfferCustomerInputs(attributeResult.value)).toHaveLength(1)
    expect(getOfferAttributes(attributeResult.value)).toEqual([
      { key: 'minimum_guests', label: 'Minimum guests', valueType: 'quantity', value: 8 },
    ])
  })
})
