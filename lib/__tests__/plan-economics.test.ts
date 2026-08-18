import { describe, expect, it } from 'vitest'
import { getPlanEconomics, monthlyNexezCost, planBreakevenGmv } from '../plan-economics'

describe('plan economics', () => {
  it('calculates subscription plus basis-point commission in integer cents', () => {
    expect(monthlyNexezCost(100_000, { subscriptionCents: 1_900, commissionBps: 700 })).toBe(8_900)
    expect(monthlyNexezCost(12_345, { subscriptionCents: 0, commissionBps: 150 })).toBe(185)
  })

  it('pins the self-serve break-even ladder', () => {
    expect(planBreakevenGmv(getPlanEconomics('free')!, getPlanEconomics('launch')!)).toBe(95_000)
    expect(planBreakevenGmv(getPlanEconomics('launch')!, getPlanEconomics('pro')!)).toBe(150_000)
    expect(planBreakevenGmv(getPlanEconomics('pro')!, getPlanEconomics('scale')!)).toBe(500_000)
  })

  it('returns null when a higher plan cannot earn back its subscription difference', () => {
    expect(planBreakevenGmv(
      { subscriptionCents: 1_900, commissionBps: 500 },
      { subscriptionCents: 4_900, commissionBps: 500 },
    )).toBeNull()
  })

  it('does not pretend negotiated Enterprise subscription pricing is known', () => {
    expect(getPlanEconomics('enterprise')).toBeNull()
  })
})
