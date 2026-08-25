import { describe, expect, it } from 'vitest'
import {
  formatCustomDomainClaimExpiry,
  getCustomDomainClaimState,
  type CustomDomainClaim,
} from './custom-domain-claim'

const claim = (overrides: Partial<CustomDomainClaim> = {}): CustomDomainClaim => ({
  domain: 'agents.example.com',
  claimedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: '2026-08-15T00:00:00.000Z',
  verifiedAt: null,
  owned: true,
  available: false,
  ...overrides,
})

describe('custom-domain claim lifecycle', () => {
  it('distinguishes an active reservation from an expired one', () => {
    expect(getCustomDomainClaimState(claim(), Date.parse('2026-08-14T23:59:59.000Z'))).toBe('reserved')
    expect(getCustomDomainClaimState(claim(), Date.parse('2026-08-15T00:00:00.000Z'))).toBe('expired')
  })

  it('keeps verified ownership permanent even after the setup date', () => {
    expect(
      getCustomDomainClaimState(
        claim({ verifiedAt: '2026-08-03T00:00:00.000Z' }),
        Date.parse('2027-01-01T00:00:00.000Z'),
      ),
    ).toBe('verified')
  })

  it('marks a page whose canonical claim moved to another owner as lost', () => {
    expect(getCustomDomainClaimState(claim({ owned: false }))).toBe('lost')
  })

  it('distinguishes an available domain from a claim held by another owner', () => {
    expect(getCustomDomainClaimState(claim({ owned: false, available: true }))).toBe('available')
  })

  it('does not invent a lifecycle state when the server has no expiry evidence', () => {
    expect(getCustomDomainClaimState(claim({ expiresAt: null }))).toBe('unknown')
    expect(getCustomDomainClaimState(null)).toBe('none')
  })

  it('formats the exact server expiry without changing the stored instant', () => {
    expect(formatCustomDomainClaimExpiry('2026-08-15T12:00:00.000Z', 'en-US')).toBe('Aug 15, 2026')
  })
})
