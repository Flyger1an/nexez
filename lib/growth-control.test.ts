import { describe, expect, it } from 'vitest'
import {
  EMPTY_GROWTH_METRICS,
  emptyGrowthControlSnapshot,
  summarizeGrowthControl,
} from './growth-control'

describe('summarizeGrowthControl', () => {
  it('derives bounded campaign and conversion rates', () => {
    const summary = summarizeGrowthControl(
      { maxGrants: 100 },
      {
        ...EMPTY_GROWTH_METRICS,
        grantsTotal: 25,
        paidConversions: 5,
        invitesTotal: 10,
        invitesClaimed: 3,
        invitesQualified: 2,
        invitesDelivered: 8,
      },
    )

    expect(summary).toEqual({
      capacityRemaining: 75,
      capacityPercent: 25,
      inviteClaimRate: 50,
      inviteQualificationRate: 20,
      deliveryRate: 80,
      paidConversionRate: 20,
    })
  })

  it('never returns negative capacity or invalid percentages', () => {
    const summary = summarizeGrowthControl(
      { maxGrants: 2 },
      {
        ...EMPTY_GROWTH_METRICS,
        grantsTotal: 4,
        paidConversions: 9,
        invitesTotal: 0,
        invitesClaimed: 4,
      },
    )

    expect(summary.capacityRemaining).toBe(0)
    expect(summary.capacityPercent).toBe(100)
    expect(summary.paidConversionRate).toBe(100)
    expect(summary.inviteClaimRate).toBe(0)
  })

  it('creates an isolated empty snapshot', () => {
    const first = emptyGrowthControlSnapshot()
    first.metrics.grantsTotal = 8
    const second = emptyGrowthControlSnapshot()

    expect(second.metrics.grantsTotal).toBe(0)
    expect(second.campaign).toBeNull()
    expect(second.available).toBe(false)
  })
})
