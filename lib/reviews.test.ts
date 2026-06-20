import { describe, expect, it } from 'vitest'
import { buildReviewSummary, canReviewOrderStatus, emptyReviewSummary, normalizeReviewTags } from './reviews'

describe('review helpers', () => {
  it('normalizes tags to the approved list, unique, and capped', () => {
    expect(normalizeReviewTags([
      'Fast response',
      'Bad tag',
      'Fast response',
      'Agent-friendly',
      'Delivered on time',
      'Would buy again',
      'Clear communication',
      'Accurate listing',
      'Fair pricing',
    ])).toEqual([
      'Fast response',
      'Agent-friendly',
      'Delivered on time',
      'Would buy again',
      'Clear communication',
      'Accurate listing',
    ])
  })

  it('limits review eligibility to paid or completed outcomes', () => {
    expect(canReviewOrderStatus('paid')).toBe(true)
    expect(canReviewOrderStatus('complete')).toBe(true)
    expect(canReviewOrderStatus('dispute_won')).toBe(true)
    expect(canReviewOrderStatus('refunded')).toBe(false)
    expect(canReviewOrderStatus('held')).toBe(false)
  })

  it('builds an empty summary safely', () => {
    expect(buildReviewSummary([])).toEqual(emptyReviewSummary())
  })

  it('builds distribution, recent tags, and Bayesian reputation score', () => {
    const summary = buildReviewSummary([
      {
        id: 'r1',
        rating: 5,
        title: 'Excellent',
        body: 'Fast and clear.',
        tags: ['Fast response', 'Agent-friendly'],
        created_at: '2026-06-20T00:00:00Z',
      },
      {
        id: 'r2',
        rating: 4,
        title: 'Solid',
        body: 'Good delivery.',
        tags: ['Fast response'],
        created_at: '2026-06-19T00:00:00Z',
      },
      {
        id: 'r3',
        rating: 2,
        title: 'Slow',
        body: 'Needed follow-up.',
        tags: ['Fast response'],
        created_at: '2026-06-18T00:00:00Z',
      },
    ])

    expect(summary.average).toBe(3.7)
    expect(summary.count).toBe(3)
    expect(summary.verified_count).toBe(3)
    expect(summary.distribution).toMatchObject({ '2': 1, '4': 1, '5': 1 })
    expect(summary.recent_positive_tags[0]).toEqual({ label: 'Fast response', count: 2 })
    expect(summary.recent_reviews.map((review) => review.id)).toEqual(['r1', 'r2', 'r3'])
    expect(summary.average).not.toBeNull()
    expect(summary.reputation_score).toBeGreaterThan(summary.average as number)
    expect(summary.reputation_score).toBeLessThan(4.2)
  })
})
