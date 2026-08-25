import { describe, expect, it } from 'vitest'
import {
  evaluateProposal,
  getBookingRuleError,
  isBlackoutDate,
  publicBookingConstraints,
  publicRulesEvaluation,
  toYmd,
} from '../offer-rules'
import type { OfferItem } from '../agent-page'

const negotiable = (rules: OfferItem['rules'], price = '$1,000'): Pick<OfferItem, 'offerType' | 'rules' | 'price'> => ({
  offerType: 'negotiable',
  rules,
  price,
})

describe('evaluateProposal - decision matrix', () => {
  it('never auto-accepts a non-negotiable offer', () => {
    expect(evaluateProposal({ offerType: undefined, rules: { autoAccept: true }, price: '$100' }, { proposedPriceCents: 100_00 }))
      .toMatchObject({ schemaVersion: 2, decision: 'review', reasons: ['offer_not_negotiable'], checks: [] })
  })

  it('reviews when no pricing rules are configured', () => {
    expect(evaluateProposal(negotiable(undefined), { proposedPriceCents: 90_000 }).decision).toBe('review')
    expect(evaluateProposal(negotiable({ minNoticeHours: 24 }), { proposedPriceCents: 90_000 }).reasons).toContain('no_pricing_rules')
  })

  it('reviews when the proposed price is missing/unparseable (never auto-accepts blind)', () => {
    expect(evaluateProposal(negotiable({ minPrice: '$500', autoAccept: true }), { proposedPriceCents: null }))
      .toMatchObject({ schemaVersion: 2, decision: 'review', reasons: ['no_proposed_price'] })
  })

  it('flags below-minimum proposals', () => {
    const result = evaluateProposal(negotiable({ minPrice: '$800' }), { proposedPriceCents: 500_00 })
    expect(result.decision).toBe('flag')
    expect(result.reasons).toContain('below_min_price')
  })

  it('flags proposals beyond the max discount vs listed price', () => {
    // listed $1,000, max 20% discount → floor $800; proposing $700 exceeds it
    const result = evaluateProposal(negotiable({ maxDiscountPercent: 20 }), { proposedPriceCents: 700_00 })
    expect(result.decision).toBe('flag')
    expect(result.reasons).toContain('exceeds_max_discount')
  })

  it('auto-accepts when autoAccept is on and every pricing rule passes', () => {
    expect(evaluateProposal(negotiable({ minPrice: '$800', autoAccept: true }), { proposedPriceCents: 900_00 }))
      .toMatchObject({ schemaVersion: 2, decision: 'auto_accept', reasons: ['meets_pricing_rules'] })
  })

  it('respects the auto-accept band (within X% of listed price)', () => {
    const rules = { minPrice: '$500', autoAccept: true, autoAcceptWithinPercent: 10 }
    // listed $1,000, band floor $900: $950 auto-accepts, $850 stays in review
    expect(evaluateProposal(negotiable(rules), { proposedPriceCents: 950_00 }).decision).toBe('auto_accept')
    const below = evaluateProposal(negotiable(rules), { proposedPriceCents: 850_00 })
    expect(below.decision).toBe('review')
    expect(below.reasons).toContain('outside_auto_accept_band')
  })

  it('within rules but autoAccept off → review for the human inbox', () => {
    expect(evaluateProposal(negotiable({ minPrice: '$500' }), { proposedPriceCents: 900_00 }))
      .toMatchObject({ schemaVersion: 2, decision: 'review', reasons: ['within_rules'] })
  })

  it('auto-accepts only when every configured transaction term passes', () => {
    const result = evaluateProposal(negotiable({
      minPrice: '$500',
      autoAccept: true,
      includedScope: 'Logo design; brand guide',
      excludedScope: 'Website development',
      maxRevisions: 2,
      maxProjectWeeks: 4,
    }), {
      proposedPriceCents: 900_00,
      requestedTerms: {
        scope: 'Logo design',
        revisionCount: 2,
        projectWeeks: 3,
      },
    })

    expect(result.decision).toBe('auto_accept')
    expect(result.checks).toEqual(expect.arrayContaining([
      { key: 'included_scope', status: 'pass', reason: 'included_scope_match' },
      { key: 'excluded_scope', status: 'pass', reason: 'excluded_scope_clear' },
      { key: 'revision_limit', status: 'pass', reason: 'within_revision_limit' },
      { key: 'project_length', status: 'pass', reason: 'within_project_length' },
    ]))
  })

  it('requires review when a configured term is missing or not clearly included', () => {
    const result = evaluateProposal(negotiable({
      autoAccept: true,
      includedScope: 'Logo design',
      maxRevisions: 2,
    }), {
      proposedPriceCents: 900_00,
      requestedTerms: { scope: 'Packaging design' },
    })

    expect(result.decision).toBe('review')
    expect(result.checks).toEqual(expect.arrayContaining([
      { key: 'included_scope', status: 'review', reason: 'scope_needs_review' },
      { key: 'revision_limit', status: 'review', reason: 'revision_count_not_provided' },
    ]))
  })

  it('flags explicitly excluded work and term limits outside seller rules', () => {
    const result = evaluateProposal(negotiable({
      autoAccept: true,
      excludedScope: 'Source files',
      maxRevisions: 2,
      maxProjectWeeks: 4,
    }), {
      proposedPriceCents: 900_00,
      requestedTerms: {
        deliverables: ['Logo design', 'Source files'],
        revisionCount: 3,
        projectWeeks: 6,
      },
    })

    expect(result.decision).toBe('flag')
    expect(result.checks).toEqual(expect.arrayContaining([
      { key: 'excluded_scope', status: 'fail', reason: 'excluded_scope_requested' },
      { key: 'revision_limit', status: 'fail', reason: 'exceeds_revision_limit' },
      { key: 'project_length', status: 'fail', reason: 'exceeds_project_length' },
    ]))
  })

  it('fails closed to review for invalid seller rules and buyer term values', () => {
    const misconfigured = evaluateProposal(negotiable({
      autoAccept: true,
      maxDiscountPercent: 120,
      maxRevisions: -1,
    }), {
      proposedPriceCents: 900_00,
      requestedTerms: { revisionCount: 1.5 },
    })

    expect(misconfigured.decision).toBe('review')
    expect(misconfigured.reasons).toContain('price_rule_misconfigured')
    expect(misconfigured.checks).toContainEqual({
      key: 'revision_limit',
      status: 'review',
      reason: 'seller_term_rule_misconfigured',
    })
  })
})

describe('publicRulesEvaluation - buyer-safe evidence', () => {
  it('uses fixed public copy without leaking raw reasons or seller thresholds', () => {
    const result = publicRulesEvaluation({
      schemaVersion: 2,
      decision: 'flag',
      reasons: ['below_min_price', 'private_floor_120000'],
      checks: [
        { key: 'price', status: 'fail', reason: 'outside_price_rules' },
        { key: 'revision_limit', status: 'fail', reason: 'exceeds_revision_limit' },
      ],
      minPrice: '$1,200',
    })

    expect(result).toEqual({
      schemaVersion: 1,
      outcome: 'outside_rules',
      summary: 'The proposal is outside at least one seller rule.',
      checks: [
        {
          key: 'price',
          label: 'Price',
          status: 'fail',
          message: 'The offered price is outside the seller\'s automatic rules.',
        },
        {
          key: 'revision_limit',
          label: 'Revisions',
          status: 'fail',
          message: 'The requested revisions exceed the seller\'s limit.',
        },
      ],
    })
    expect(JSON.stringify(result)).not.toMatch(/1,?200|below_min|private_floor|minPrice/)
  })

  it('ignores unknown checks and invalid stored values', () => {
    expect(publicRulesEvaluation(null)).toBeNull()
    expect(publicRulesEvaluation({ decision: 'unknown' })).toBeNull()
    expect(publicRulesEvaluation({
      decision: 'review',
      checks: [{ key: 'future_private_rule', status: 'fail', reason: 'secret' }],
    })?.checks).toEqual([])
  })
})

describe('getBookingRuleError - calendar protection', () => {
  it('rejects when the weekly booking cap is reached', () => {
    const err = getBookingRuleError({ rules: { maxBookingsPerWeek: 3 } }, { recentBookingsThisWeek: 3 })
    expect(err).toMatch(/booking limit/i)
    expect(getBookingRuleError({ rules: { maxBookingsPerWeek: 3 } }, { recentBookingsThisWeek: 2 })).toBeNull()
  })

  it('rejects bookings on a blackout date', () => {
    const today = toYmd(new Date('2026-07-04T12:00:00Z'))
    const err = getBookingRuleError({ rules: { blackoutDates: [today] } }, { now: new Date('2026-07-04T12:00:00Z') })
    expect(err).toMatch(/blackout/i)
  })

  it('passes with no rules', () => {
    expect(getBookingRuleError({ rules: undefined }, {})).toBeNull()
  })
})

describe('publicBookingConstraints - privacy invariant', () => {
  it('exposes only public-safe fields and NEVER pricing rules', () => {
    const constraints = publicBookingConstraints(
      negotiable({
        minPrice: '$1,200',
        maxDiscountPercent: 15,
        autoAccept: true,
        autoAcceptWithinPercent: 10,
        minNoticeHours: 48,
        blackoutDates: ['2026-12-25'],
        maxBookingsPerWeek: 5,
        includedScope: 'Logo design',
        excludedScope: 'Website development',
        maxRevisions: 2,
        maxProjectWeeks: 6,
      }),
    )
    expect(constraints).toEqual({
      offer_type: 'negotiable',
      accepts_negotiation: true,
      min_notice_hours: 48,
      blackout_dates: ['2026-12-25'],
      max_bookings_per_week: 5,
      included_scope: 'Logo design',
      excluded_scope: 'Website development',
      max_revisions: 2,
      max_project_weeks: 6,
    })
    const serialized = JSON.stringify(constraints)
    expect(serialized).not.toMatch(/minPrice|1,?200|maxDiscount|autoAccept|15|10(?!0)/)
  })

  it('defaults to fixed with no constraints', () => {
    expect(publicBookingConstraints({ offerType: undefined, rules: undefined })).toEqual({
      offer_type: 'fixed',
      accepts_negotiation: false,
    })
  })
})

describe('isBlackoutDate', () => {
  it('matches plain YYYY-MM-DD strings', () => {
    expect(isBlackoutDate({ blackoutDates: ['2026-07-04'] }, '2026-07-04')).toBe(true)
    expect(isBlackoutDate({ blackoutDates: ['2026-07-04'] }, '2026-07-05')).toBe(false)
    expect(isBlackoutDate(undefined, '2026-07-04')).toBe(false)
  })
})
