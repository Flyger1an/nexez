import { describe, expect, it } from 'vitest'
import {
  allowedCommerceSupplyTransitions,
  canTransitionCommerceSupplyCampaign,
} from './commerce-supply-campaign'

describe('Commerce supply campaign lifecycle', () => {
  it('requires an explicit sourcing step before outreach', () => {
    expect(allowedCommerceSupplyTransitions('new')).toEqual(['sourcing', 'dismissed'])
    expect(canTransitionCommerceSupplyCampaign('new', 'contacted')).toBe(false)
    expect(canTransitionCommerceSupplyCampaign('sourcing', 'contacted')).toBe(true)
  })

  it('supports correction and deliberate reopening without inventing a live state', () => {
    expect(allowedCommerceSupplyTransitions('onboarding')).toEqual(['contacted', 'dismissed'])
    expect(allowedCommerceSupplyTransitions('dismissed')).toEqual(['new', 'sourcing'])
    expect(canTransitionCommerceSupplyCampaign('onboarding', 'new')).toBe(false)
  })
})
