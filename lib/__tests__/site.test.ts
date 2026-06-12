import { describe, it, expect } from 'vitest'
import {
  AGENT_RUNTIME_HOST,
  APP_HOST,
  MARKETING_HOST,
  agentRuntimeUrl,
  appUrl,
  canonicalHostFor,
  isAppPath,
  isHostNeutralPath,
  isMarketingPath,
  marketingUrl,
} from '../site'

describe('isMarketingPath', () => {
  it('treats the homepage + marketing prefixes as marketing', () => {
    for (const p of ['/', '/pricing', '/pricing/teams', '/directory', '/leaderboard', '/marketplace', '/simulator', '/support', '/privacy', '/terms', '/design', '/blog/x', '/docs']) {
      expect(isMarketingPath(p), p).toBe(true)
    }
  })

  it('treats app/runtime routes as NOT marketing', () => {
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
  it('routes marketing, app, and public runtime paths to their canonical hosts', () => {
    expect(canonicalHostFor('/')).toBe(MARKETING_HOST)
    expect(canonicalHostFor('/pricing')).toBe(MARKETING_HOST)
    expect(canonicalHostFor('/api/directory')).toBe(MARKETING_HOST)

    expect(canonicalHostFor('/dashboard')).toBe(APP_HOST)
    expect(canonicalHostFor('/create')).toBe(APP_HOST)
    expect(canonicalHostFor('/api/billing')).toBe(APP_HOST)

    expect(canonicalHostFor('/some-slug')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/agent-pages.json')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/api/negotiations')).toBe(AGENT_RUNTIME_HOST)
  })

  it('keeps the money + webhook + checkout/negotiate routes on the agent runtime host', () => {
    // These are buyer/Stripe/agent surfaces; pinning them guards against an
    // accidental prefix-list reshuffle that would break escrow links or webhook delivery.
    expect(canonicalHostFor('/api/checkout')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/api/webhooks/stripe')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/api/cron/reconcile-escrow')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/api/v1/pages')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/checkout/acme')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/negotiate/abc-123')).toBe(AGENT_RUNTIME_HOST)
  })

  it('defaults an UNLISTED /api/* route to the private app host (fail-safe), but a slug to the runtime', () => {
    expect(canonicalHostFor('/api/some-future-private-route')).toBe(APP_HOST)
    expect(canonicalHostFor('/totally-unknown-slug')).toBe(AGENT_RUNTIME_HOST)
  })
})

describe('isAppPath', () => {
  it('only flags human product routes', () => {
    expect(isAppPath('/dashboard')).toBe(true)
    expect(isAppPath('/dashboard/settings')).toBe(true)
    expect(isAppPath('/create')).toBe(true)
    expect(isAppPath('/some-slug')).toBe(false)
  })
})

describe('appUrl / marketingUrl / agentRuntimeUrl', () => {
  it('build absolute cross-domain URLs and add a leading slash', () => {
    expect(appUrl('/login')).toBe(`https://${APP_HOST}/login`)
    expect(appUrl('onboard')).toBe(`https://${APP_HOST}/onboard`)
    expect(marketingUrl('/pricing')).toBe(`https://${MARKETING_HOST}/pricing`)
    expect(marketingUrl()).toBe(`https://${MARKETING_HOST}/`)
    expect(agentRuntimeUrl('/acme')).toBe(`https://${AGENT_RUNTIME_HOST}/acme`)
  })

  it('the hosts are distinct', () => {
    expect(APP_HOST).not.toBe(MARKETING_HOST)
    expect(AGENT_RUNTIME_HOST).not.toBe(MARKETING_HOST)
    expect(AGENT_RUNTIME_HOST).not.toBe(APP_HOST)
  })
})
