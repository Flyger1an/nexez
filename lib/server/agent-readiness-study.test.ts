import { describe, it, expect } from 'vitest'
import {
  buildOverpassQuery,
  deterministicSample,
  extractOverpassCandidates,
  isPathAllowedByRobots,
  normalizeTargetWebsite,
} from './agent-readiness-study'

describe('isPathAllowedByRobots (harness politeness pre-check)', () => {
  it('allows when robots.txt is missing or empty', () => {
    expect(isPathAllowedByRobots(null, 'nexez')).toBe(true)
    expect(isPathAllowedByRobots('   ', 'nexez')).toBe(true)
  })

  it('respects a wildcard full disallow', () => {
    expect(isPathAllowedByRobots('User-agent: *\nDisallow: /', 'nexez')).toBe(false)
  })

  it('respects a disallow targeting our token specifically', () => {
    const txt = 'User-agent: nexez\nDisallow: /\n\nUser-agent: *\nDisallow:'
    expect(isPathAllowedByRobots(txt, 'nexez')).toBe(false)
  })

  it('prefers the most specific matching group over wildcard', () => {
    const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: nexez\nAllow: /'
    expect(isPathAllowedByRobots(txt, 'nexez')).toBe(true)
  })

  it('ignores path-scoped disallows that do not cover the root', () => {
    expect(isPathAllowedByRobots('User-agent: *\nDisallow: /admin', 'nexez')).toBe(true)
  })

  it('lets an Allow override win at equal match length', () => {
    const txt = 'User-agent: *\nDisallow: /\nAllow: /'
    expect(isPathAllowedByRobots(txt, 'nexez')).toBe(true)
  })
})

describe('normalizeTargetWebsite', () => {
  it('adds https and reduces to the origin', () => {
    expect(normalizeTargetWebsite('joesplumbing.com/services?utm=x')).toEqual({
      url: 'https://joesplumbing.com',
      domain: 'joesplumbing.com',
    })
  })

  it('keeps www in the scan URL but strips it from the dedupe domain', () => {
    expect(normalizeTargetWebsite('https://www.acme-salon.com')).toEqual({
      url: 'https://www.acme-salon.com',
      domain: 'acme-salon.com',
    })
  })

  it('rejects platform-hosted pages that are not the business own site', () => {
    expect(normalizeTargetWebsite('https://www.facebook.com/joesdiner')).toBeNull()
    expect(normalizeTargetWebsite('https://linktr.ee/joesdiner')).toBeNull()
    expect(normalizeTargetWebsite('https://order.toasttab.com/online/joes')).toBeNull()
  })

  it('rejects non-http schemes, hostless values, and garbage', () => {
    expect(normalizeTargetWebsite('mailto:joe@example.com')).toBeNull()
    expect(normalizeTargetWebsite('localhost')).toBeNull()
    expect(normalizeTargetWebsite('')).toBeNull()
    expect(normalizeTargetWebsite(undefined)).toBeNull()
  })
})

describe('extractOverpassCandidates', () => {
  it('keeps independents with a website, drops brand-tagged chains, dedupes by domain', () => {
    const candidates = extractOverpassCandidates([
      { tags: { name: 'Joes Diner', website: 'https://joesdiner.example' } },
      { tags: { name: 'Joes Diner Downtown', website: 'https://www.joesdiner.example/downtown' } },
      { tags: { name: 'MegaBurger', brand: 'MegaBurger', 'brand:wikidata': 'Q1', website: 'https://megaburger.example' } },
      { tags: { name: 'Contact Tag Cafe', 'contact:website': 'contactcafe.example' } },
      { tags: { name: 'No Website Bar' } },
      {},
    ])
    expect(candidates.map((c) => c.domain).sort()).toEqual(['contactcafe.example', 'joesdiner.example'])
  })
})

describe('deterministicSample', () => {
  it('is stable for a given cohort and caps the size', () => {
    const pool = ['a.example', 'b.example', 'c.example', 'd.example', 'e.example'].map((domain) => ({ domain }))
    const first = deterministicSample(pool, 'readiness-2026-08', 3)
    const second = deterministicSample([...pool].reverse(), 'readiness-2026-08', 3)
    expect(first).toHaveLength(3)
    expect(first.map((c) => c.domain)).toEqual(second.map((c) => c.domain))
  })

  it('orders differently under a different cohort seed', () => {
    const pool = Array.from({ length: 12 }, (_, i) => ({ domain: `site-${i}.example` }))
    const a = deterministicSample(pool, 'cohort-a', 12).map((c) => c.domain)
    const b = deterministicSample(pool, 'cohort-b', 12).map((c) => c.domain)
    expect(a).not.toEqual(b)
  })
})

describe('buildOverpassQuery', () => {
  it('produces parseable QL with both website tag variants and the bbox', () => {
    const query = buildOverpassQuery('restaurants', [39.83, -83.2, 40.15, -82.75])
    expect(query).toContain('[out:json]')
    expect(query).toContain('"website"')
    expect(query).toContain('"contact:website"')
    expect(query).toContain('39.83,-83.2,40.15,-82.75')
    expect(query).toContain('amenity')
  })
})
