import { describe, expect, it } from 'vitest'
import type { CommerceTemplateOpportunityRow } from '../commerce-template-opportunities'
import {
  buildCommerceTemplateReviewEvidence,
  commerceTemplateReviewDecisionLabel,
  commerceTemplateReviewReasonLabel,
  groupCommerceTemplateReviewEvents,
  type CommerceTemplateReviewEvent,
} from '../commerce-template-reviews'

describe('Commerce Template reviews', () => {
  it('preserves unavailable evidence and keeps checkout separate from negotiated commerce', () => {
    const row = opportunityRow()
    row.supply = { available: false, certifiedListings: null }
    row.checkout = { available: false, orders: null, listings: null, rails: null }

    const evidence = buildCommerceTemplateReviewEvidence({
      generatedAt: '2026-08-26T03:00:00.000Z',
      sources: {
        demand: true,
        demandTruncated: false,
        supply: false,
        listings: true,
        benchmark: true,
        checkout: false,
        negotiated: true,
      },
      row,
    })

    expect(evidence.supply).toEqual({ available: false, certifiedListings: null })
    expect(evidence.checkout).toEqual({ available: false, orders: null, listings: null, rails: null })
    expect(evidence.negotiated).toEqual({ available: true, deals: 2, listings: 1 })
    expect(evidence.recommendation.performanceReviewReady).toBe(true)
  })

  it('does not call a manual review performance-ready', () => {
    const row = opportunityRow()
    row.action = 'gather-more-evidence'
    row.actionLabel = 'Gather more evidence'

    const evidence = buildCommerceTemplateReviewEvidence({
      generatedAt: '2026-08-26T03:00:00.000Z',
      sources: availableSources(),
      row,
    })

    expect(evidence.recommendation.performanceReviewReady).toBe(false)
    expect(evidence.recommendation.action).toBe('gather-more-evidence')
  })

  it('derives open and decided cases from immutable events', () => {
    const opened = reviewEvent({ eventType: 'opened', decision: null, createdAt: '2026-08-26T03:00:00.000Z' })
    const decided = reviewEvent({
      id: 'event-2',
      eventType: 'decided',
      decision: 'revise',
      createdAt: '2026-08-26T04:00:00.000Z',
    })
    const other = reviewEvent({
      id: 'event-3',
      reviewId: 'review-2',
      eventType: 'opened',
      decision: null,
      createdAt: '2026-08-26T05:00:00.000Z',
    })

    expect(groupCommerceTemplateReviewEvents([decided, opened, other])).toMatchObject([
      { reviewId: 'review-2', status: 'open', decision: null },
      { reviewId: 'review-1', status: 'decided', decision: { decision: 'revise' } },
    ])
  })

  it('uses plain-language labels for the review desk', () => {
    expect(commerceTemplateReviewReasonLabel('catalog_overlap')).toBe('Guide overlap')
    expect(commerceTemplateReviewDecisionLabel('recommend_retirement')).toBe('Recommend retirement')
  })
})

function availableSources() {
  return {
    demand: true,
    demandTruncated: false,
    supply: true,
    listings: true,
    benchmark: true,
    checkout: true,
    negotiated: true,
  }
}

function opportunityRow(): CommerceTemplateOpportunityRow {
  return {
    rank: 1,
    templateId: 'events.party-rentals',
    templateVersion: 1,
    title: 'Party Rentals',
    domain: 'events-hospitality',
    action: 'review-template',
    actionLabel: 'Review this guide',
    reason: 'Readiness trails the comparison group on sufficient exact-version evidence.',
    tone: 'watch',
    demand: { available: true, truncated: false, observed: 8, unresolved: 3 },
    supply: { available: true, certifiedListings: 2 },
    adoption: {
      available: true,
      listings: 6,
      publishedListings: 4,
      publishedRate: 66.7,
      averageReadiness: 72,
      readinessVsNoTemplate: -8,
    },
    checkout: {
      available: true,
      orders: 3,
      listings: 2,
      rails: {
        hosted_checkout: 1,
        protocol_checkout: 1,
        recurring_service: 0,
        staged_settlement: 1,
        resource_reservation: 0,
      },
    },
    negotiated: { available: true, deals: 2, listings: 1 },
  }
}

function reviewEvent(overrides: Partial<CommerceTemplateReviewEvent>): CommerceTemplateReviewEvent {
  const evidence = buildCommerceTemplateReviewEvidence({
    generatedAt: '2026-08-26T03:00:00.000Z',
    sources: availableSources(),
    row: opportunityRow(),
  })
  return {
    id: 'event-1',
    reviewId: 'review-1',
    templateId: 'events.party-rentals',
    templateVersion: 1,
    reviewReason: 'performance',
    eventType: 'opened',
    decision: null,
    rationale: 'Review the guide against the preserved evidence.',
    snapshotGeneratedAt: evidence.generatedAt,
    evidence,
    createdAt: '2026-08-26T03:00:00.000Z',
    ...overrides,
  }
}
