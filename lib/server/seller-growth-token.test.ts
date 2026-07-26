import { describe, expect, it } from 'vitest'
import {
  createSellerGrowthInviteToken,
  hashSellerGrowthInviteToken,
  isSellerGrowthInviteToken,
} from './seller-growth-token'

describe('seller growth invite tokens', () => {
  it('creates high-entropy URL-safe tokens and stores only a stable hash', () => {
    const first = createSellerGrowthInviteToken()
    const second = createSellerGrowthInviteToken()

    expect(first).not.toBe(second)
    expect(isSellerGrowthInviteToken(first)).toBe(true)
    expect(first).not.toMatch(/[+/=]/)
    expect(hashSellerGrowthInviteToken(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSellerGrowthInviteToken(first)).toBe(hashSellerGrowthInviteToken(first))
    expect(hashSellerGrowthInviteToken(first)).not.toBe(hashSellerGrowthInviteToken(second))
  })

  it('rejects short, overlong, and malformed route tokens', () => {
    expect(isSellerGrowthInviteToken('short')).toBe(false)
    expect(isSellerGrowthInviteToken('a'.repeat(39))).toBe(false)
    expect(isSellerGrowthInviteToken('a'.repeat(65))).toBe(false)
    expect(isSellerGrowthInviteToken(`${'a'.repeat(42)}!`)).toBe(false)
  })
})
