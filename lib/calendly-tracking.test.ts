import { describe, it, expect } from 'vitest'
import { tagCalendlyTracking, parseNegotiationTracking } from './calendly-tracking'

describe('tagCalendlyTracking', () => {
  it('stamps utm_content=nz_neg_<id> on a Calendly link', () => {
    const out = tagCalendlyTracking('https://calendly.com/acme/intro', 'neg-123')
    expect(new URL(out!).searchParams.get('utm_content')).toBe('nz_neg_neg-123')
  })
  it('works on any calendly.com subdomain and preserves existing params', () => {
    const out = tagCalendlyTracking('https://acme.calendly.com/intro?month=2026-07', 'n1')
    const u = new URL(out!)
    expect(u.searchParams.get('utm_content')).toBe('nz_neg_n1')
    expect(u.searchParams.get('month')).toBe('2026-07')
  })
  it('leaves non-Calendly links untouched (round-trip only works via Calendly)', () => {
    expect(tagCalendlyTracking('https://cal.com/acme/intro', 'n1')).toBe('https://cal.com/acme/intro')
    expect(tagCalendlyTracking('https://acuityscheduling.com/x', 'n1')).toBe('https://acuityscheduling.com/x')
    // Look-alike host must not match.
    expect(tagCalendlyTracking('https://calendly.com.evil.test/x', 'n1')).toBe('https://calendly.com.evil.test/x')
  })
  it('does not clobber a non-ours utm_content the owner set intentionally', () => {
    const link = 'https://calendly.com/acme/intro?utm_content=spring-sale'
    expect(tagCalendlyTracking(link, 'n1')).toBe(link)
  })
  it('overwrites a prior nz_neg_ tag (re-decision safe)', () => {
    const out = tagCalendlyTracking('https://calendly.com/acme/intro?utm_content=nz_neg_old', 'new')
    expect(new URL(out!).searchParams.get('utm_content')).toBe('nz_neg_new')
  })
  it('is a no-op without a link or id, and survives an unparseable URL', () => {
    expect(tagCalendlyTracking(undefined, 'n1')).toBeUndefined()
    expect(tagCalendlyTracking(null, 'n1')).toBeUndefined()
    expect(tagCalendlyTracking('https://calendly.com/x', '')).toBe('https://calendly.com/x')
    expect(tagCalendlyTracking('not a url', 'n1')).toBe('not a url')
  })
})

describe('parseNegotiationTracking', () => {
  it('recovers the negotiation id from a valid tracking value', () => {
    expect(parseNegotiationTracking('nz_neg_abc-123')).toBe('abc-123')
    expect(parseNegotiationTracking('  nz_neg_xyz  ')).toBe('xyz')
  })
  it('returns null for anything that is not one of ours', () => {
    expect(parseNegotiationTracking('spring-sale')).toBeNull()
    expect(parseNegotiationTracking('nz_neg_')).toBeNull() // bare prefix = empty id
    expect(parseNegotiationTracking(null)).toBeNull()
    expect(parseNegotiationTracking(undefined)).toBeNull()
    expect(parseNegotiationTracking(42)).toBeNull()
  })
  it('round-trips with tagCalendlyTracking', () => {
    const tagged = tagCalendlyTracking('https://calendly.com/acme/intro', 'round-trip-id')!
    const utm = new URL(tagged).searchParams.get('utm_content')
    expect(parseNegotiationTracking(utm)).toBe('round-trip-id')
  })
})
