import { describe, expect, it } from 'vitest'
import { listCommerceTemplates } from './registry'
import {
  preflightCommerceBuyerClaims,
  type CommerceBuyerClaim,
  type CommerceBuyerEvidence,
} from './buyer-preflight'

function template(id: string) {
  const found = listCommerceTemplates({ status: 'active' }).find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing commerce template ${id}`)
  return found
}

describe('preflightCommerceBuyerClaims', () => {
  it('accepts exact buyer and merchant claims with independent matching provenance', () => {
    const claims: CommerceBuyerClaim[] = [
      {
        id: 'student-level',
        kind: 'buyer-context',
        factKey: 'student-level',
        value: 'tenth grader',
        evidenceIds: ['buyer-grade'],
      },
      {
        id: 'subject-fit',
        kind: 'merchant-fact',
        factKey: 'subject',
        value: 'algebra',
        evidenceIds: ['merchant-subject'],
      },
    ]
    const evidence: CommerceBuyerEvidence[] = [
      { id: 'buyer-grade', source: 'buyer-request', factKey: 'student-level', value: 'tenth grader' },
      { id: 'merchant-subject', source: 'merchant-manifest', factKey: 'subject', value: 'algebra' },
    ]

    const result = preflightCommerceBuyerClaims(
      template('education.private-tutoring'),
      claims,
      evidence,
    )

    expect(result.ok).toBe(true)
    expect(result.claims.every((claim) => claim.status === 'accepted')).toBe(true)
  })

  it('accepts exact dry-run pricing and published availability evidence', () => {
    const result = preflightCommerceBuyerClaims(
      template('professional.business-strategy-session'),
      [
        {
          id: 'final-price',
          kind: 'price',
          factKey: 'price',
          value: { currency: 'usd', amount: 45000 },
          evidenceIds: ['dry-run-price'],
        },
        {
          id: 'appointment-slot',
          kind: 'availability',
          factKey: 'availability',
          value: '2026-08-21T15:00:00-05:00',
          evidenceIds: ['published-slot'],
        },
      ],
      [
        {
          id: 'dry-run-price',
          source: 'checkout-dry-run',
          factKey: 'price',
          value: { amount: 45000, currency: 'usd' },
        },
        {
          id: 'published-slot',
          source: 'published-availability',
          factKey: 'availability',
          value: '2026-08-21T15:00:00-05:00',
        },
      ],
    )

    expect(result.ok).toBe(true)
  })

  it('rejects an assertion with no provenance', () => {
    const result = preflightCommerceBuyerClaims(
      template('home.recurring-home-cleaning'),
      [
        {
          id: 'invented-price',
          kind: 'price',
          factKey: 'price-logic',
          value: '$149',
          evidenceIds: [],
        },
      ],
      [],
    )

    expect(result.ok).toBe(false)
    expect(result.claims[0]).toMatchObject({ status: 'rejected' })
    expect(result.claims[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing_evidence' })]),
    )
  })

  it('rejects altered buyer context even when the correct source exists', () => {
    const result = preflightCommerceBuyerClaims(
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

    expect(result.ok).toBe(false)
    expect(result.claims[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'evidence_value_mismatch' })]),
    )
  })

  it('rejects laundering buyer context through merchant evidence', () => {
    const result = preflightCommerceBuyerClaims(
      template('professional.web-design-project'),
      [
        {
          id: 'client-assets',
          kind: 'buyer-context',
          factKey: 'client-inputs',
          value: 'copy and brand assets ready',
          evidenceIds: ['merchant-note'],
        },
      ],
      [
        {
          id: 'merchant-note',
          source: 'merchant-manifest',
          factKey: 'client-inputs',
          value: 'copy and brand assets ready',
        },
      ],
    )

    expect(result.ok).toBe(false)
    expect(result.claims[0].diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'evidence_source_mismatch' })]),
    )
  })

  it('fails closed on unknown facts and ambiguous ids', () => {
    const result = preflightCommerceBuyerClaims(
      template('automotive.mobile-auto-detailing'),
      [
        {
          id: 'duplicate',
          kind: 'merchant-fact',
          factKey: 'not-a-fact',
          value: true,
          evidenceIds: ['same-evidence'],
        },
        {
          id: 'duplicate',
          kind: 'merchant-fact',
          factKey: 'package',
          value: 'full detail',
          evidenceIds: ['same-evidence'],
        },
      ],
      [
        { id: 'same-evidence', source: 'merchant-manifest', factKey: 'package', value: 'full detail' },
        { id: 'same-evidence', source: 'merchant-manifest', factKey: 'package', value: 'full detail' },
      ],
    )

    expect(result.ok).toBe(false)
    expect(result.claims.flatMap((claim) => claim.diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_claim_id' }),
        expect.objectContaining({ code: 'duplicate_evidence_id' }),
        expect.objectContaining({ code: 'unknown_fact' }),
      ]),
    )
  })

  it('returns deterministic JSON-safe results', () => {
    const result = preflightCommerceBuyerClaims(
      template('events.event-photography'),
      [
        {
          id: 'rights',
          kind: 'merchant-fact',
          factKey: 'licensing',
          value: { paidAds: true },
          evidenceIds: [],
        },
      ],
      [],
    )

    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})
