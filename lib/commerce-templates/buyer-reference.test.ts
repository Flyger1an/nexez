import { describe, expect, it } from 'vitest'
import { decideCommerceBuyerClaims } from './buyer-reference'
import { listCommerceTemplates } from './registry'

function template(id: string) {
  const found = listCommerceTemplates({ status: 'active' }).find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing commerce template ${id}`)
  return found
}

describe('decideCommerceBuyerClaims', () => {
  it('emits only provenance-supported claims as assertions', () => {
    const decision = decideCommerceBuyerClaims(
      template('education.private-tutoring'),
      [
        {
          id: 'student-grade',
          kind: 'buyer-context',
          factKey: 'student-level',
          value: 'tenth grader',
          evidenceIds: ['buyer-grade'],
        },
        {
          id: 'subject-expertise',
          kind: 'merchant-fact',
          factKey: 'subject',
          value: 'algebra',
          evidenceIds: ['merchant-subject'],
        },
      ],
      [
        { id: 'buyer-grade', source: 'buyer-request', factKey: 'student-level', value: 'tenth grader' },
        { id: 'merchant-subject', source: 'merchant-manifest', factKey: 'subject', value: 'algebra' },
      ],
    )

    expect(decision.status).toBe('ready')
    expect(decision.assertions.map((claim) => claim.id)).toEqual(['student-grade', 'subject-expertise'])
    expect(decision.blockedClaims).toEqual([])
  })

  it('withholds unsupported claims and asks the appropriate truth source instead', () => {
    const decision = decideCommerceBuyerClaims(
      template('professional.business-strategy-session'),
      [
        {
          id: 'invented-time',
          kind: 'availability',
          factKey: 'availability',
          value: '2026-08-21T10:00:00-05:00',
          evidenceIds: [],
        },
        {
          id: 'invented-expertise',
          kind: 'merchant-fact',
          factKey: 'topic-fit',
          value: 'growth strategy specialist',
          evidenceIds: [],
        },
      ],
      [],
    )

    expect(decision.status).toBe('needs-information')
    expect(decision.assertions).toEqual([])
    expect(decision.blockedClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim: expect.objectContaining({ id: 'invented-time' }),
          nextStep: 'check-published-availability',
        }),
        expect.objectContaining({
          claim: expect.objectContaining({ id: 'invented-expertise' }),
          nextStep: 'read-merchant-manifest',
        }),
      ]),
    )
  })

  it('maps missing buyer context and price to deterministic recovery actions', () => {
    const decision = decideCommerceBuyerClaims(
      template('home.recurring-home-cleaning'),
      [
        {
          id: 'home-size',
          kind: 'buyer-context',
          factKey: 'property-sizing',
          value: '3 bed / 2 bath',
          evidenceIds: [],
        },
        {
          id: 'final-price',
          kind: 'price',
          factKey: 'price-logic',
          value: { currency: 'usd', amount: 14900 },
          evidenceIds: [],
        },
      ],
      [],
    )

    expect(decision.assertions).toHaveLength(0)
    expect(decision.blockedClaims.map((blocked) => blocked.nextStep)).toEqual([
      'ask-buyer',
      'dry-run-checkout',
    ])
  })

  it('withholds altered buyer context even when a source exists', () => {
    const decision = decideCommerceBuyerClaims(
      template('education.private-tutoring'),
      [
        {
          id: 'wrong-grade',
          kind: 'buyer-context',
          factKey: 'student-level',
          value: 'college freshman',
          evidenceIds: ['buyer-grade'],
        },
      ],
      [
        { id: 'buyer-grade', source: 'buyer-request', factKey: 'student-level', value: 'tenth grader' },
      ],
    )

    expect(decision.status).toBe('needs-information')
    expect(decision.assertions).toEqual([])
    expect(decision.blockedClaims[0]).toMatchObject({ nextStep: 'ask-buyer' })
    expect(decision.blockedClaims[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'evidence_value_mismatch' })]),
    )
  })

  it('returns a deterministic JSON-safe decision', () => {
    const decision = decideCommerceBuyerClaims(
      template('events.private-chef'),
      [
        {
          id: 'dietary-support',
          kind: 'merchant-fact',
          factKey: 'dietary',
          value: ['vegan'],
          evidenceIds: [],
        },
      ],
      [],
    )

    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision)
  })
})
