import { describe, expect, it } from 'vitest'
import { deriveDomainState } from '../vercel-domains'

describe('deriveDomainState', () => {
  it('is unconfigured with no domain', () => {
    expect(deriveDomainState({ hasDomain: false, ownershipVerified: false, providerConfigured: false }).state).toBe(
      'unconfigured',
    )
  })

  it('surfaces error state', () => {
    expect(
      deriveDomainState({ hasDomain: true, ownershipVerified: false, providerConfigured: true, errored: true }).state,
    ).toBe('error')
  })

  describe('provider configured (authoritative)', () => {
    const base = { hasDomain: true, ownershipVerified: false, providerConfigured: true }

    it('pending DNS when not attached', () => {
      expect(deriveDomainState({ ...base, attached: false }).state).toBe('pending_dns')
    })

    it('pending DNS when attached but misconfigured', () => {
      expect(deriveDomainState({ ...base, attached: true, misconfigured: true }).state).toBe('pending_dns')
    })

    it('verifying when attached + configured but not yet verified', () => {
      expect(
        deriveDomainState({ ...base, attached: true, misconfigured: false, providerVerified: false }).state,
      ).toBe('verifying')
    })

    it('live when attached + verified + not misconfigured', () => {
      expect(
        deriveDomainState({ ...base, attached: true, misconfigured: false, providerVerified: true }).state,
      ).toBe('live')
    })
  })

  describe('manual mode (no provider token)', () => {
    it('pending DNS until ownership verified', () => {
      expect(
        deriveDomainState({ hasDomain: true, ownershipVerified: false, providerConfigured: false }).state,
      ).toBe('pending_dns')
    })

    it('verifying (not falsely "live") once ownership is proven', () => {
      const result = deriveDomainState({ hasDomain: true, ownershipVerified: true, providerConfigured: false })
      expect(result.state).toBe('verifying')
      expect(result.detail).toMatch(/SSL/i)
    })
  })
})
