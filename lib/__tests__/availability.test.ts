import { describe, expect, it } from 'vitest'
import { availabilityLabel, schemaAvailability } from '../agent-page'

describe('availability helpers', () => {
  it('maps to schema.org URLs', () => {
    expect(schemaAvailability('available')).toBe('https://schema.org/InStock')
    expect(schemaAvailability('limited')).toBe('https://schema.org/LimitedAvailability')
    expect(schemaAvailability('sold_out')).toBe('https://schema.org/SoldOut')
    expect(schemaAvailability(undefined)).toBe('https://schema.org/InStock')
  })
  it('labels only non-default states', () => {
    expect(availabilityLabel('available')).toBeNull()
    expect(availabilityLabel(undefined)).toBeNull()
    expect(availabilityLabel('limited')).toBe('Limited availability')
    expect(availabilityLabel('sold_out')).toBe('Sold out')
  })
})
