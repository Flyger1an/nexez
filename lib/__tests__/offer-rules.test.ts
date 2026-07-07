import { describe, expect, it } from 'vitest'
import {
  evaluateProposal,
  getBookingRuleError,
  isBlackoutDate,
  publicBookingConstraints,
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
      .toEqual({ decision: 'review', reasons: ['offer_not_negotiable'] })
  })

  it('reviews when no pricing rules are configured', () => {
    expect(evaluateProposal(negotiable(undefined), { proposedPriceCents: 90_000 }).decision).toBe('review')
    expect(evaluateProposal(negotiable({ minNoticeHours: 24 }), { proposedPriceCents: 90_000 }).reasons).toContain('no_pricing_rules')
  })

  it('reviews when the proposed price is missing/unparseable (never auto-accepts blind)', () => {
    expect(evaluateProposal(negotiable({ minPrice: '$500', autoAccept: true }), { proposedPriceCents: null }))
      .toEqual({ decision: 'review', reasons: ['no_proposed_price'] })
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
      .toEqual({ decision: 'auto_accept', reasons: ['meets_pricing_rules'] })
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
      .toEqual({ decision: 'review', reasons: ['within_rules'] })
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
      }),
    )
    expect(constraints).toEqual({
      offer_type: 'negotiable',
      accepts_negotiation: true,
      min_notice_hours: 48,
      blackout_dates: ['2026-12-25'],
      max_bookings_per_week: 5,
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
