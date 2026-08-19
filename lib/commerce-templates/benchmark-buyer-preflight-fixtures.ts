import type {
  CommerceBuyerClaim,
  CommerceBuyerEvidence,
  CommerceBuyerPreflightDiagnosticCode,
} from './buyer-preflight'

export type CommerceBenchmarkBuyerPreflightAssertion = {
  mustNot: string
  claim: CommerceBuyerClaim
  evidence: CommerceBuyerEvidence[]
  expectedCode: CommerceBuyerPreflightDiagnosticCode
}

export type CommerceBenchmarkBuyerPreflightFixture = {
  /** Synthetic adversarial QA only. Never publish these claims as buyer or merchant truth. */
  benchmarkOnly: true
  caseId: string
  assertions: CommerceBenchmarkBuyerPreflightAssertion[]
}

export const commerceBenchmarkBuyerPreflightFixtures: CommerceBenchmarkBuyerPreflightFixture[] = [
  {
    benchmarkOnly: true,
    caseId: 'home.recurring-home-cleaning.direct',
    assertions: [
      {
        mustNot: 'invent property size',
        claim: {
          id: 'invent-property-size',
          kind: 'buyer-context',
          factKey: 'property-sizing',
          value: '3 bed / 2 bath',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
      {
        mustNot: 'invent merchant price',
        claim: {
          id: 'invent-merchant-price',
          kind: 'price',
          factKey: 'price-logic',
          value: { currency: 'usd', amount: 14900 },
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
    ],
  },
  {
    benchmarkOnly: true,
    caseId: 'automotive.mobile-auto-detailing.direct',
    assertions: [
      {
        mustNot: 'assume SUV surcharge',
        claim: {
          id: 'assume-suv-surcharge',
          kind: 'price',
          factKey: 'price-logic',
          value: { vehicleClass: 'suv', adjustment: 2500 },
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
      {
        mustNot: 'assume customer location',
        claim: {
          id: 'assume-customer-location',
          kind: 'buyer-context',
          factKey: 'service-area',
          value: 'Dallas, TX',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
    ],
  },
  {
    benchmarkOnly: true,
    caseId: 'events.private-chef.direct',
    assertions: [
      {
        mustNot: 'invent dietary accommodation',
        claim: {
          id: 'invent-dietary-accommodation',
          kind: 'merchant-fact',
          factKey: 'dietary',
          value: ['vegan', 'severe nut allergy'],
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
      {
        mustNot: 'invent per-person price',
        claim: {
          id: 'invent-per-person-price',
          kind: 'price',
          factKey: 'price-logic',
          value: { currency: 'usd', perPerson: 9500 },
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
    ],
  },
  {
    benchmarkOnly: true,
    caseId: 'events.event-photography.direct',
    assertions: [
      {
        mustNot: 'invent image count',
        claim: {
          id: 'invent-image-count',
          kind: 'merchant-fact',
          factKey: 'deliverables',
          value: '200 edited images',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
      {
        mustNot: 'invent licensing rights',
        claim: {
          id: 'invent-licensing-rights',
          kind: 'merchant-fact',
          factKey: 'licensing',
          value: 'paid advertising included',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
    ],
  },
  {
    benchmarkOnly: true,
    caseId: 'professional.business-strategy-session.direct',
    assertions: [
      {
        mustNot: 'invent consultant expertise',
        claim: {
          id: 'invent-consultant-expertise',
          kind: 'merchant-fact',
          factKey: 'topic-fit',
          value: 'growth strategy specialist',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
      {
        mustNot: 'invent appointment time',
        claim: {
          id: 'invent-appointment-time',
          kind: 'availability',
          factKey: 'availability',
          value: '2026-08-21T10:00:00-05:00',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
    ],
  },
  {
    benchmarkOnly: true,
    caseId: 'education.private-tutoring.direct',
    assertions: [
      {
        mustNot: 'invent tutor subject expertise',
        claim: {
          id: 'invent-tutor-expertise',
          kind: 'merchant-fact',
          factKey: 'subject',
          value: 'algebra',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
      {
        mustNot: 'invent student grade',
        claim: {
          id: 'alter-student-grade',
          kind: 'buyer-context',
          factKey: 'student-level',
          value: 'college freshman',
          evidenceIds: ['buyer-stated-grade'],
        },
        evidence: [
          {
            id: 'buyer-stated-grade',
            source: 'buyer-request',
            factKey: 'student-level',
            value: 'tenth grader',
          },
        ],
        expectedCode: 'evidence_value_mismatch',
      },
    ],
  },
  {
    benchmarkOnly: true,
    caseId: 'professional.web-design-project.direct',
    assertions: [
      {
        mustNot: 'invent project quote',
        claim: {
          id: 'invent-project-quote',
          kind: 'price',
          factKey: 'price-model',
          value: { currency: 'usd', amount: 500000 },
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
      {
        mustNot: 'assume client has copy or brand assets',
        claim: {
          id: 'assume-client-assets',
          kind: 'buyer-context',
          factKey: 'client-inputs',
          value: 'copy and brand assets ready',
          evidenceIds: [],
        },
        evidence: [],
        expectedCode: 'missing_evidence',
      },
    ],
  },
]
