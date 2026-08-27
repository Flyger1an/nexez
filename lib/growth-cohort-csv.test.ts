import { describe, expect, it } from 'vitest'
import { normalizeVerificationStatus, parseGrowthCohortCsv } from './growth-cohort-csv'

describe('growth cohort CSV', () => {
  it('normalizes common MillionVerifier and Apollo statuses', () => {
    expect(normalizeVerificationStatus('ok')).toBe('valid')
    expect(normalizeVerificationStatus('Verified')).toBe('valid')
    expect(normalizeVerificationStatus('catch-all')).toBe('risky')
    expect(normalizeVerificationStatus('guessed')).toBe('risky')
    expect(normalizeVerificationStatus('bounced')).toBe('invalid')
    expect(normalizeVerificationStatus('unavailable')).toBe('unknown')
  })

  it('parses quoted fields and assigns capped waves when the CSV has no wave column', () => {
    const result = parseGrowthCohortCsv([
      'email,company,verification_status',
      'one@example.com,"One, LLC",ok',
      'two@example.com,Two,catch_all',
      'three@example.com,Three,invalid',
    ].join('\n'), { waveSize: 2, defaultProvider: 'millionverifier' })

    expect(result.errors).toEqual([])
    expect(result.candidates).toEqual([
      expect.objectContaining({ email: 'one@example.com', label: 'One, LLC', wave: 1, verificationStatus: 'valid' }),
      expect.objectContaining({ email: 'two@example.com', wave: 1, verificationStatus: 'risky' }),
      expect.objectContaining({ email: 'three@example.com', wave: 2, verificationStatus: 'invalid' }),
    ])
  })

  it('deduplicates addresses before staging and reports malformed rows', () => {
    const result = parseGrowthCohortCsv([
      'email,label,wave,result,provider',
      'Owner@Example.com,First,1,verified,apollo',
      'owner@example.com,Duplicate,1,verified,apollo',
      'not-an-email,Bad,1,verified,apollo',
    ].join('\n'), { waveSize: 20, defaultProvider: 'apollo' })

    expect(result.candidates).toHaveLength(1)
    expect(result.duplicateEmails).toEqual(['owner@example.com'])
    expect(result.errors).toEqual(['Row 4 has an invalid email.'])
  })

  it('normalizes verifier brand variants before the server-side allowlist', () => {
    const result = parseGrowthCohortCsv(
      'email,result,provider\nowner@example.com,verified,Apollo.io',
      { waveSize: 20, defaultProvider: 'millionverifier' },
    )

    expect(result.candidates[0]?.verificationProvider).toBe('apollo')
  })
})
