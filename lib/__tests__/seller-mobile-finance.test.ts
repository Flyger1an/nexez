import { describe, expect, it } from 'vitest'
import { commissionPercentForPlan } from '../../apps/seller-mobile/src/lib/billing'
import { formatCurrency } from '../../apps/seller-mobile/src/lib/format'

describe('seller mobile finance helpers', () => {
  it('matches the platform plan commission schedule', () => {
    expect(commissionPercentForPlan('free')).toBe(9)
    expect(commissionPercentForPlan('pro')).toBe(5)
    expect(commissionPercentForPlan('enterprise')).toBe(2)
  })

  it('fails closed to the highest standard commission rate', () => {
    expect(commissionPercentForPlan(null)).toBe(9)
    expect(commissionPercentForPlan('unknown')).toBe(9)
  })

  it('formats ordinary currencies from hundredths', () => {
    expect(formatCurrency(1234, 'usd')).toMatch(/12\.34/)
  })

  it('keeps zero-decimal Stripe units unchanged', () => {
    const formatted = formatCurrency(1000, 'jpy')
    expect(formatted).toMatch(/1,?000/)
    expect(formatted).not.toContain('.00')
  })
})
