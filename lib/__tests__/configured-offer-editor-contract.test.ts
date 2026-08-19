import { describe, expect, it } from 'vitest'
import { rewriteOfferForAgents } from '../ai-optimize'
import {
  getOfferAttributes,
  getOfferCustomerInputs,
  mergeOfferCollectionPreservingConfiguration,
  type ConfiguredOfferItem,
} from '../configured-offer'

describe('configured offer editor optimization contract', () => {
  it('keeps normalized offer identity stable so optimized copy cannot duplicate or detach merchant configuration', () => {
    const authoritative: ConfiguredOfferItem = {
      name: '  Mobile Detail  ',
      description: 'Interior and exterior detail',
      price: '$180',
      url: '',
      customerInputs: [
        {
          key: 'vehicle_class',
          label: 'Vehicle class',
          valueType: 'text',
          required: true,
          askBuyer: 'What vehicle class should we detail?',
        },
      ],
      attributes: [
        { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
      ],
    }

    const optimized = rewriteOfferForAgents(authoritative, {
      businessName: 'DFW Detail Co.',
      audience: 'vehicle owners',
    })

    // The optimizer may normalize surrounding whitespace but must not rename the
    // commercial offer. That invariant is what lets the editor merge optimized
    // scalar copy back onto the authoritative rich offer safely.
    expect(optimized.name).toBe('Mobile Detail')

    const merged = mergeOfferCollectionPreservingConfiguration([authoritative], [optimized])

    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('Mobile Detail')
    expect(getOfferCustomerInputs(merged[0]).map((field) => field.key)).toEqual(['vehicle_class'])
    expect(getOfferAttributes(merged[0])).toEqual([
      { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
    ])
  })
})
