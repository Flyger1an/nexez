import { describe, it, expect } from 'vitest'
import { isMarketingPath, isHostNeutralPath, canonicalHostFor, appUrl, marketingUrl, APP_HOST, MARKETING_HOST } from '../site'

describe('isMarketingPath', () => {
  it('treats the homepage + marketing prefixes as marketing (→ nexez.ai)', () => {
    for (const p of ['/', '/pricing', '/pricing/teams', '/directory', '/leaderboard', '/marketplace', '/simulator', '/support', '/privacy', '/terms', '/design', '/blog/x', '/docs']) {
      expect(isMarketingPath(p), p).toBe(true)
    }
  })

  it('treats brain routes as NOT marketing (→ nexez.app)', () => {
    for (const p of ['/dashboard', '/dashboard/x', '/negotiate/abc', '/checkout/foo', '/api/negotiations', '/login', '/onboard', '/create', '/some-agent-slug', '/agent.json']) {
      expect(isMarketingPath(p), p).toBe(false)
    }
  })

  it('matches prefixes only at a path-segment boundary', () => {
    expect(isMarketingPath('/design')).toBe(true)
    expect(isMarketingPath('/designs')).toBe(false) // an agent page slug, not the /design route
    expect(isMarketingPath('/supporters')).toBe(false)
  })

  it('ignores trailing slashes', () => {
    expect(isMarketingPath('/pricing/')).toBe(true)
    expect(isMarketingPath('/dashboard/')).toBe(false)
  })
})

describe('isHostNeutralPath', () => {
  it('flags per-host SEO files (served on both domains, never redirected)', () => {
    expect(isHostNeutralPath('/sitemap.xml')).toBe(true)
    expect(isHostNeutralPath('/robots.txt')).toBe(true)
  })
  it('does not flag normal routes', () => {
    expect(isHostNeutralPath('/pricing')).toBe(false)
    expect(isHostNeutralPath('/dashboard')).toBe(false)
    expect(isHostNeutralPath('/')).toBe(false)
  })
})

describe('canonicalHostFor', () => {
  it('routes marketing → MARKETING_HOST, everything else (the brain) → APP_HOST', () => {
    expect(canonicalHostFor('/')).toBe(MARKETING_HOST)
    expect(canonicalHostFor('/pricing')).toBe(MARKETING_HOST)
    expect(canonicalHostFor('/dashboard')).toBe(APP_HOST)
    expect(canonicalHostFor('/some-slug')).toBe(APP_HOST)
    expect(canonicalHostFor('/api/negotiations')).toBe(APP_HOST)
  })
})

describe('appUrl / marketingUrl', () => {
  it('build absolute cross-domain URLs and add a leading slash', () => {
    expect(appUrl('/login')).toBe(`https://${APP_HOST}/login`)
    expect(appUrl('onboard')).toBe(`https://${APP_HOST}/onboard`)
    expect(marketingUrl('/pricing')).toBe(`https://${MARKETING_HOST}/pricing`)
    expect(marketingUrl()).toBe(`https://${MARKETING_HOST}/`)
  })

  it('the two hosts are distinct (the split is real)', () => {
    expect(APP_HOST).not.toBe(MARKETING_HOST)
  })
})
