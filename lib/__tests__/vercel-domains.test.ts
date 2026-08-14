import { describe, expect, it } from 'vitest'
import { deriveDomainState, isCnameProviderProof, type VercelDomainStatus } from '../vercel-domains'

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
    const base = {
      hasDomain: true,
      ownershipVerified: false,
      providerConfigured: true,
      providerConfigChecked: true,
      verificationMethod: 'cname' as const,
      configuredBy: 'CNAME' as const,
      cnameConfigured: true,
    }

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

    it('does not treat a failed configuration check as live', () => {
      expect(
        deriveDomainState({
          ...base,
          attached: true,
          providerVerified: true,
          providerConfigChecked: false,
          misconfigured: null,
        }).state,
      ).toBe('error')
    })

    it('requires TXT ownership for an apex even when its A record is healthy', () => {
      expect(
        deriveDomainState({
          ...base,
          attached: true,
          providerVerified: true,
          verificationMethod: 'txt',
          configuredBy: 'A',
          ownershipVerified: false,
          misconfigured: false,
        }).state,
      ).toBe('verifying')
    })

    it('live when attached + verified + not misconfigured', () => {
      expect(
        deriveDomainState({ ...base, attached: true, misconfigured: false, providerVerified: true }).state,
      ).toBe('live')
    })
  })

  describe('CNAME provider proof', () => {
    const status: VercelDomainStatus = {
      attached: true,
      verified: true,
      configChecked: true,
      misconfigured: false,
      configuredBy: 'CNAME',
      apexName: 'acme.com',
      verificationMethod: 'cname',
      requiredRecords: [],
      recommendedCNAME: ['project.vercel-dns-017.com'],
      recommendedIPv4: [],
    }

    it('accepts only the complete healthy CNAME signal', () => {
      expect(isCnameProviderProof(status, true)).toBe(true)
      expect(isCnameProviderProof({ ...status, configChecked: false }, true)).toBe(false)
      expect(isCnameProviderProof({ ...status, verified: false }, true)).toBe(false)
      expect(isCnameProviderProof({ ...status, misconfigured: true }, true)).toBe(false)
      expect(isCnameProviderProof({ ...status, configuredBy: 'http' }, true)).toBe(true)
      expect(isCnameProviderProof({ ...status, verificationMethod: 'txt' }, true)).toBe(false)
      expect(isCnameProviderProof({ ...status, error: 'provider error' }, true)).toBe(false)
      expect(isCnameProviderProof(status, false)).toBe(false)
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
