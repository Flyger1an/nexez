import { describe, expect, it } from 'vitest'
import { commerceCurationCandidates } from '.'
import { findCommerceSimulationMatch } from './simulation'

describe('findCommerceSimulationMatch', () => {
  it('abstains when only a fulfillment modifier overlaps', () => {
    expect(findCommerceSimulationMatch('Find a mobile notary', commerceCurationCandidates)).toBeNull()
  })

  it('still matches service-language variants when service identity agrees', () => {
    const match = findCommerceSimulationMatch(
      'Find a mobile car detailer for this weekend',
      commerceCurationCandidates,
    )

    expect(match?.candidate.id).toBe('automotive.mobile-auto-detailing')
    expect(match?.matchedTerms).toContain('detail')
  })

  it('matches a private chef by the service noun rather than the mobile modifier', () => {
    const match = findCommerceSimulationMatch('Find a mobile chef', commerceCurationCandidates)

    expect(match?.candidate.id).toBe('events.private-chef')
    expect(match?.matchedTerms).toContain('chef')
  })

  it('abstains from an under-specified category shared by several scenarios', () => {
    expect(findCommerceSimulationMatch('I need cleaning', commerceCurationCandidates)).toBeNull()
  })

  it('keeps every complete Commerce Library title addressable', () => {
    for (const candidate of commerceCurationCandidates) {
      const match = findCommerceSimulationMatch(candidate.title, commerceCurationCandidates)
      expect(match?.candidate.id, candidate.title).toBe(candidate.id)
    }
  })
})
