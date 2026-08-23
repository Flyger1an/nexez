import { describe, expect, it } from 'vitest'
import { commerceCurationCandidates, commerceReferenceCandidates } from '.'
import {
  commerceCandidateEvidenceMatches,
  commerceRequestedCatalogIdentityTerms,
  commerceRequestedServiceEvidenceTerms,
  commerceRequestedServiceIdentityTerms,
  commerceRequestedServiceText,
  findCommerceSimulationMatch,
} from './simulation'

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

  it('understands specific Party Rentals requests without treating every rental as an event rental', () => {
    expect(findCommerceSimulationMatch(
      'Rent 80 chairs and 10 tables for a party Saturday',
      commerceReferenceCandidates,
    )?.candidate.id).toBe('events.party-rentals')
    expect(findCommerceSimulationMatch(
      'Find party rentals with delivery and setup',
      commerceReferenceCandidates,
    )?.candidate.id).toBe('events.party-rentals')

    expect(findCommerceSimulationMatch('Find a car rental this weekend', commerceReferenceCandidates)).toBeNull()
    expect(findCommerceSimulationMatch('Book a vacation rental for a wedding', commerceReferenceCandidates)).toBeNull()
    expect(findCommerceSimulationMatch('Rent a party bus for Saturday', commerceReferenceCandidates)).toBeNull()
  })

  it('applies candidate context boundaries to marketplace evidence', () => {
    const partyRentals = commerceReferenceCandidates.find((candidate) => candidate.id === 'events.party-rentals')
    expect(partyRentals).toBeDefined()
    if (!partyRentals) return

    expect(commerceCandidateEvidenceMatches(
      partyRentals,
      'Residential vacation-rental and home cleaning. One-time premium cleaning for rental properties.',
      commerceReferenceCandidates,
    )).toBe(false)
    expect(commerceCandidateEvidenceMatches(
      partyRentals,
      'Party Rentals with tables, chairs, tents, delivery, and setup.',
      commerceReferenceCandidates,
    )).toBe(true)

    const personalTraining = commerceReferenceCandidates.find((candidate) => candidate.id === 'personal.personal-training')
    expect(personalTraining).toBeDefined()
    if (!personalTraining) return
    expect(commerceCandidateEvidenceMatches(
      personalTraining,
      'Dog Training - personalized obedience programs and recurring sessions for dogs.',
      commerceReferenceCandidates,
    )).toBe(false)
    expect(commerceCandidateEvidenceMatches(
      personalTraining,
      'Personal Training and Dog Training programs.',
      commerceReferenceCandidates,
    )).toBe(false)
  })

  it('rejects every cross-domain canonical seller identity', () => {
    for (const requested of commerceReferenceCandidates) {
      for (const seller of commerceReferenceCandidates) {
        if (requested.domain === seller.domain) continue
        const evidence = [seller.title, seller.teaches].join('. ')
        expect(
          commerceCandidateEvidenceMatches(requested, evidence, commerceReferenceCandidates),
          `${seller.id} seller evidence must not override ${requested.id}`,
        ).toBe(false)
      }
    }
  })

  it('accepts every canonical seller identity inside its own commerce domain', () => {
    for (const candidate of commerceReferenceCandidates) {
      const evidence = [candidate.title, candidate.teaches].join('. ')
      expect(
        commerceCandidateEvidenceMatches(candidate, evidence, commerceReferenceCandidates),
        `${candidate.id} must recognize its own seller evidence`,
      ).toBe(true)
    }
  })

  it('matches a private chef by the service noun rather than the mobile modifier', () => {
    const match = findCommerceSimulationMatch('Find a mobile chef', commerceCurationCandidates)

    expect(match?.candidate.id).toBe('events.private-chef')
    expect(match?.matchedTerms).toContain('chef')
    expect(match?.matchedIdentityTerms).toEqual(['chef'])
  })

  it('identifies tutoring by the service noun instead of cadence or subject modifiers', () => {
    const match = findCommerceSimulationMatch(
      'I need a private tutor for weekly math lessons',
      commerceCurationCandidates,
    )

    expect(match?.candidate.id).toBe('education.private-tutoring')
    expect(match?.matchedIdentityTerms).toEqual(['tutor'])
  })

  it('abstains from an under-specified category shared by several scenarios', () => {
    expect(findCommerceSimulationMatch('I need cleaning', commerceCurationCandidates)).toBeNull()
  })

  it('does not treat wedding context as wedding-videography identity', () => {
    const query = 'find me a baker for a 7ft tall wedding cake in austin this weekend'

    expect(findCommerceSimulationMatch(query, commerceCurationCandidates)).toBeNull()
  })

  it('routes a wedding-cake request to additive reference coverage', () => {
    const match = findCommerceSimulationMatch(
      'find me a baker for a 7ft tall wedding cake in austin this weekend',
      commerceReferenceCandidates,
    )

    expect(match?.candidate.id).toBe('events.custom-celebration-cake')
    expect(match?.matchedIdentityTerms).toEqual(['baker'])
    expect(match?.candidate.title).not.toBe('Wedding Videography')
  })

  it('recognizes a baker alias without requiring the canonical title', () => {
    const match = findCommerceSimulationMatch('Find me a baker in Austin', commerceReferenceCandidates)

    expect(match?.candidate.id).toBe('events.custom-celebration-cake')
    expect(match?.matchedIdentityTerms).toEqual(['baker'])
  })

  it('anchors category identity to the requested service span', () => {
    expect(commerceRequestedServiceText(
      'Find me a copywriter for a mobile auto detailing website in Austin',
    )).toBe('copywriter')
    expect(commerceRequestedServiceIdentityTerms(
      'Find me a copywriter for a mobile auto detailing website in Austin',
    )).toEqual(['copywrit'])

    const match = findCommerceSimulationMatch(
      'Find me a copywriter for a mobile auto detailing website in Austin',
      commerceReferenceCandidates,
    )
    expect(match?.candidate.id).toBe('professional.copywriting-package')
  })

  it('retains all compound catalog identities for fail-closed marketplace checks', () => {
    expect(commerceRequestedCatalogIdentityTerms(
      'I need a photographer and videographer',
      commerceReferenceCandidates,
    )).toEqual(['photograph', 'videograph'])
    expect(commerceRequestedCatalogIdentityTerms(
      'Find a mobile notary for a wedding in Austin',
      commerceReferenceCandidates,
    )).toEqual(['notary'])
  })

  it('preserves fulfillment modifiers when checking uncovered live-supply identity', () => {
    expect(commerceRequestedServiceEvidenceTerms(
      'Find a car rental this weekend',
    )).toEqual(['car', 'rental'])
    expect(commerceRequestedServiceEvidenceTerms(
      'Book a vacation rental for a wedding',
    )).toEqual(['vacation', 'rental'])
    expect(commerceRequestedServiceEvidenceTerms(
      'Find a mobile notary in Austin',
    )).toEqual(['mobile', 'notary'])
  })

  it('keeps requirement nouns from overriding the requested provider', () => {
    expect(findCommerceSimulationMatch(
      'Find a photographer for a custom celebration cake shoot',
      commerceReferenceCandidates,
    )?.candidate.id).toBe('events.event-photography')

    expect(findCommerceSimulationMatch(
      'Find a baker for a wedding videography launch party',
      commerceReferenceCandidates,
    )?.candidate.id).toBe('events.custom-celebration-cake')
  })

  it('abstains from compound service requests instead of picking one side', () => {
    expect(findCommerceSimulationMatch(
      'I need a photographer and videographer',
      commerceReferenceCandidates,
    )).toBeNull()
    expect(findCommerceSimulationMatch(
      'I need a private chef and event caterer',
      commerceReferenceCandidates,
    )).toBeNull()
  })

  it('keeps every reference dominant over every other scenario used as request context', () => {
    for (const requested of commerceReferenceCandidates) {
      for (const context of commerceReferenceCandidates) {
        if (requested.id === context.id) continue
        const match = findCommerceSimulationMatch(
          `Find me a ${requested.title} for a ${context.title}`,
          commerceReferenceCandidates,
        )
        expect(match?.candidate.id, `${requested.title} / ${context.title}`).toBe(requested.id)
      }
    }
  })

  it('keeps every complete Commerce Library title addressable', () => {
    for (const candidate of commerceReferenceCandidates) {
      const match = findCommerceSimulationMatch(candidate.title, commerceReferenceCandidates)
      expect(match?.candidate.id, candidate.title).toBe(candidate.id)
    }
  })
})
