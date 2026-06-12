import { describe, it, expect } from 'vitest'
import { isAllowedSchedulingUrl, sanitizeSchedulingLink } from '../scheduling-allowlist'

describe('isAllowedSchedulingUrl', () => {
  it('allows known providers and their subdomains', () => {
    expect(isAllowedSchedulingUrl('https://calendly.com/acme/intro')).toBe(true)
    expect(isAllowedSchedulingUrl('https://acme.calendly.com/intro')).toBe(true)
    expect(isAllowedSchedulingUrl('https://cal.com/acme')).toBe(true)
    expect(isAllowedSchedulingUrl('http://calendar.google.com/x')).toBe(true)
  })

  it('rejects unknown / malicious hosts and non-http(s) schemes', () => {
    expect(isAllowedSchedulingUrl('https://evil.example/pwn')).toBe(false)
    expect(isAllowedSchedulingUrl('https://calendly.com.evil.example/x')).toBe(false)
    expect(isAllowedSchedulingUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedSchedulingUrl('not a url')).toBe(false)
    expect(isAllowedSchedulingUrl('')).toBe(false)
    expect(isAllowedSchedulingUrl(null)).toBe(false)
  })

  it('honors an extra allowed host (the owner-configured provider)', () => {
    expect(isAllowedSchedulingUrl('https://book.mybiz.com/slot', ['book.mybiz.com'])).toBe(true)
    expect(isAllowedSchedulingUrl('https://book.mybiz.com/slot')).toBe(false)
  })
})

describe('sanitizeSchedulingLink', () => {
  it('keeps a candidate that points at a known provider', () => {
    expect(sanitizeSchedulingLink('https://calendly.com/acme')).toBe('https://calendly.com/acme')
  })

  it('drops an off-allowlist candidate, falling back to the owner link', () => {
    expect(sanitizeSchedulingLink('https://evil.example/pwn', 'https://calendly.com/acme')).toBe(
      'https://calendly.com/acme',
    )
  })

  it('returns undefined when neither candidate nor owner link is usable', () => {
    expect(sanitizeSchedulingLink('https://evil.example/pwn', null)).toBeUndefined()
    expect(sanitizeSchedulingLink(null, undefined)).toBeUndefined()
  })

  it('keeps a candidate that matches the owner-configured host', () => {
    expect(sanitizeSchedulingLink('https://book.mybiz.com/x', 'https://book.mybiz.com/default')).toBe(
      'https://book.mybiz.com/x',
    )
  })
})
