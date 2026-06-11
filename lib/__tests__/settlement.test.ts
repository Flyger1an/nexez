import { describe, it, expect } from 'vitest'
import {
  AUTO_SETTLE_DEFAULT_CENTS,
  getAutoSettleCeilingCents,
  classifySettlement,
  isPayable,
} from '../settlement'

describe('getAutoSettleCeilingCents', () => {
  it('falls back to the platform default ($2,000) with no override', () => {
    expect(getAutoSettleCeilingCents(null)).toBe(AUTO_SETTLE_DEFAULT_CENTS)
    expect(getAutoSettleCeilingCents({ rules: {} })).toBe(200_000)
    expect(getAutoSettleCeilingCents({ rules: { minPrice: '$100' } })).toBe(200_000)
  })

  it('uses the per-offer rules.autoSettleMax override (money string)', () => {
    expect(getAutoSettleCeilingCents({ rules: { autoSettleMax: '$500' } })).toBe(50_000)
    expect(getAutoSettleCeilingCents({ rules: { autoSettleMax: '5000' } })).toBe(500_000)
  })

  it('ignores an unparseable/zero override and uses the default', () => {
    expect(getAutoSettleCeilingCents({ rules: { autoSettleMax: 'free' } })).toBe(AUTO_SETTLE_DEFAULT_CENTS)
    expect(getAutoSettleCeilingCents({ rules: { autoSettleMax: '$0' } })).toBe(AUTO_SETTLE_DEFAULT_CENTS)
  })
})

describe('classifySettlement', () => {
  const ceiling = 200_000
  it('auto at or below the ceiling', () => {
    expect(classifySettlement(199_999, ceiling)).toBe('auto')
    expect(classifySettlement(200_000, ceiling)).toBe('auto')
  })
  it('awaiting_approval above the ceiling', () => {
    expect(classifySettlement(200_001, ceiling)).toBe('awaiting_approval')
    expect(classifySettlement(5_000_00, ceiling)).toBe('awaiting_approval')
  })
  it('awaiting_approval for missing/zero amounts (never auto-pays nothing)', () => {
    expect(classifySettlement(null, ceiling)).toBe('awaiting_approval')
    expect(classifySettlement(0, ceiling)).toBe('awaiting_approval')
  })
})

describe('isPayable', () => {
  it('payable only when auto or approved', () => {
    expect(isPayable('auto')).toBe(true)
    expect(isPayable('approved')).toBe(true)
    expect(isPayable('awaiting_approval')).toBe(false)
    expect(isPayable(null)).toBe(false)
    expect(isPayable(undefined)).toBe(false)
  })
})
