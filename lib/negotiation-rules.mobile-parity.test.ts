import { describe, expect, it } from 'vitest'
import {
  applyMobileNegotiationRuleDraft,
  MOBILE_NEGOTIATION_RULE_AUTHORING_KEYS,
  mobileNegotiationRuleDraft,
} from '../apps/seller-mobile/src/lib/negotiation-rules'
import type { OfferItem as MobileOfferItem } from '../apps/seller-mobile/src/types/nexez'
import { mobileRuleEvaluation } from '../apps/seller-mobile/src/lib/rule-evaluation'
import { NEGOTIATION_RULE_AUTHORING_KEYS } from './agent-page'
import { evaluateProposal, publicRulesEvaluation } from './offer-rules'

describe('seller mobile negotiation rule parity', () => {
  it('authors exactly the canonical platform rule fields', () => {
    expect([...MOBILE_NEGOTIATION_RULE_AUTHORING_KEYS].sort()).toEqual(
      [...NEGOTIATION_RULE_AUTHORING_KEYS].sort(),
    )
  })

  it.each([
    ['auto_accept', 'meets_rules'],
    ['review', 'needs_review'],
    ['flag', 'outside_rules'],
  ] as const)('maps the %s evaluation outcome consistently', (decision, outcome) => {
    const stored = {
      schemaVersion: 2,
      decision,
      reasons: ['within_rules'],
      checks: [{ key: 'price', status: 'pass', reason: 'price_within_rules' }],
    }

    expect(publicRulesEvaluation(stored)?.outcome).toBe(outcome)
    expect(mobileRuleEvaluation({ rules_evaluation: stored })?.outcome).toBe(outcome)
  })

  it('produces the same platform decisions as web-authored rules', () => {
    const baseOffer: MobileOfferItem = {
      name: 'Brand package',
      description: 'Identity work',
      price: '$1,000',
    }
    const draft = {
      ...mobileNegotiationRuleDraft(baseOffer),
      enabled: true,
      enabledChanged: true,
      minPrice: '$800',
      maxDiscountPercent: '20',
      autoAccept: true,
      autoAcceptWithinPercent: '5',
      autoCounter: true,
      includedScope: 'Logo and brand guide',
      excludedScope: 'Website development',
      maxRevisions: '2',
      maxProjectWeeks: '4',
    }
    const mobileResult = applyMobileNegotiationRuleDraft(baseOffer, draft, true)
    expect(mobileResult.ok).toBe(true)
    if (!mobileResult.ok) return

    const webOffer = {
      offerType: 'negotiable' as const,
      price: '$1,000',
      rules: {
        minPrice: '$800',
        maxDiscountPercent: 20,
        autoAccept: true,
        autoAcceptWithinPercent: 5,
        autoCounter: true,
        includedScope: 'Logo and brand guide',
        excludedScope: 'Website development',
        maxRevisions: 2,
        maxProjectWeeks: 4,
      },
    }
    const mobileOffer = {
      offerType: mobileResult.offer.offerType,
      price: mobileResult.offer.price ?? '',
      rules: mobileResult.offer.rules,
    }
    const proposals = [
      {
        proposedPriceCents: 95_000,
        requestedTerms: { scope: 'Logo and brand guide', revisionCount: 2, projectWeeks: 4 },
      },
      {
        proposedPriceCents: 79_000,
        requestedTerms: { scope: 'Logo', revisionCount: 2, projectWeeks: 4 },
      },
      {
        proposedPriceCents: 95_000,
        requestedTerms: { scope: 'Website development', revisionCount: 3, projectWeeks: 5 },
      },
    ]

    expect(proposals.map((proposal) => evaluateProposal(mobileOffer, proposal))).toEqual(
      proposals.map((proposal) => evaluateProposal(webOffer, proposal)),
    )
  })
})
