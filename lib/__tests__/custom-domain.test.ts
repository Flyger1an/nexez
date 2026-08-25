import { describe, expect, it } from 'vitest'
import {
  agentArtifactHref,
  buildCustomDomainRewrite,
  getEffectiveBaseUrl,
  hostLookupCandidates,
  isCustomHost,
  isMalformedRequestPath,
  isPlatformHost,
  mapCustomDomainPath,
  normalizeDomainPath,
  normalizeHost,
  resolveDomainPath,
  validateDomainPath,
} from '../custom-domain'

describe('normalizeHost', () => {
  it('lowercases and strips the port', () => {
    expect(normalizeHost('Acme.COM:443')).toBe('acme.com')
    expect(normalizeHost('localhost:3000')).toBe('localhost')
  })
  it('handles empty input', () => {
    expect(normalizeHost(null)).toBe('')
    expect(normalizeHost(undefined)).toBe('')
  })
})

describe('isPlatformHost', () => {
  const site = 'https://nexez.vercel.app'

  it('treats localhost + vercel.app + empty as platform', () => {
    expect(isPlatformHost('localhost:3000', site)).toBe(true)
    expect(isPlatformHost('127.0.0.1', site)).toBe(true)
    expect(isPlatformHost('my-app-git-main.vercel.app', site)).toBe(true)
    expect(isPlatformHost('', site)).toBe(true)
  })

  it('treats the configured site host (and www variant) as platform', () => {
    expect(isPlatformHost('nexez.vercel.app', site)).toBe(true)
    expect(isPlatformHost('app.nexez.com', 'https://app.nexez.com')).toBe(true)
    expect(isPlatformHost('www.nexez.com', 'https://nexez.com')).toBe(true)
    expect(isPlatformHost('admin.nexez.ai', site)).toBe(true)
  })

  it('treats a real customer domain as NOT platform', () => {
    expect(isPlatformHost('acme.com', site)).toBe(false)
    expect(isPlatformHost('agents.acme.com', site)).toBe(false)
  })
})

describe('hostLookupCandidates', () => {
  it('includes both apex and www forms', () => {
    expect(hostLookupCandidates('acme.com').sort()).toEqual(['acme.com', 'www.acme.com'])
    expect(hostLookupCandidates('www.acme.com').sort()).toEqual(['acme.com', 'www.acme.com'])
  })
  it('returns empty for no host', () => {
    expect(hostLookupCandidates('')).toEqual([])
  })
})

describe('mapCustomDomainPath', () => {
  it('maps root to the page', () => {
    expect(mapCustomDomainPath('acme-plumbing', '/')).toBe('/acme-plumbing')
    expect(mapCustomDomainPath('acme-plumbing', '')).toBe('/acme-plumbing')
  })
  it('maps agent artifacts to the per-slug paths', () => {
    expect(mapCustomDomainPath('acme-plumbing', '/agent.json')).toBe('/acme-plumbing/agent.json')
    expect(mapCustomDomainPath('acme-plumbing', '/mcp.json')).toBe('/acme-plumbing/mcp.json')
    // The brand domain serves the page-scoped spec, not the global platform one.
    expect(mapCustomDomainPath('acme-plumbing', '/openapi.json')).toBe('/acme-plumbing/openapi.json')
  })
  it('passes non-artifact paths through unchanged', () => {
    expect(mapCustomDomainPath('acme-plumbing', '/checkout/acme-plumbing')).toBe('/checkout/acme-plumbing')
    expect(mapCustomDomainPath('acme-plumbing', '/robots.txt')).toBe('/robots.txt')
  })
})

describe('isCustomHost', () => {
  const site = 'https://nexez.vercel.app'
  it('is true only for real customer domains', () => {
    expect(isCustomHost('acme.com', site)).toBe(true)
    expect(isCustomHost('nexez.vercel.app', site)).toBe(false)
    expect(isCustomHost('localhost:3000', site)).toBe(false)
    expect(isCustomHost('', site)).toBe(false)
  })
})

describe('getEffectiveBaseUrl', () => {
  const platform = 'https://nexez.vercel.app'
  it('returns the brand domain on a custom host', () => {
    expect(getEffectiveBaseUrl('acme.com', platform, platform)).toBe('https://acme.com')
    expect(getEffectiveBaseUrl('Agents.ACME.com:443', platform, platform)).toBe('https://agents.acme.com')
  })
  it('returns the platform base on platform hosts', () => {
    expect(getEffectiveBaseUrl('nexez.vercel.app', platform, platform)).toBe(platform)
    expect(getEffectiveBaseUrl('localhost:3000', platform, platform)).toBe(platform)
    expect(getEffectiveBaseUrl(null, platform, platform)).toBe(platform)
  })
})

describe('agentArtifactHref', () => {
  it('serves at domain root on a custom host (root page)', () => {
    expect(agentArtifactHref('agent.json', 'acme-plumbing', true)).toBe('/agent.json')
    expect(agentArtifactHref('mcp.json', 'acme-plumbing', true)).toBe('/mcp.json')
    expect(agentArtifactHref('openapi.json', 'acme-plumbing', true)).toBe('/openapi.json')
  })
  it('serves under the domain_path on a custom host (subpage)', () => {
    expect(agentArtifactHref('agent.json', 'acme-pricing', true, '/pricing')).toBe('/pricing/agent.json')
    expect(agentArtifactHref('mcp.json', 'acme-pricing', true, '/pricing')).toBe('/pricing/mcp.json')
  })
  it('serves under the slug on the platform', () => {
    expect(agentArtifactHref('agent.json', 'acme-plumbing', false)).toBe('/acme-plumbing/agent.json')
    expect(agentArtifactHref('mcp.json', 'acme-plumbing', false, '/pricing')).toBe('/acme-plumbing/mcp.json')
  })
})

describe('normalizeDomainPath', () => {
  it('forces leading slash, strips trailing, lowercases', () => {
    expect(normalizeDomainPath('pricing')).toBe('/pricing')
    expect(normalizeDomainPath('/Pricing/')).toBe('/pricing')
    expect(normalizeDomainPath('')).toBe('/')
    expect(normalizeDomainPath(null)).toBe('/')
    expect(normalizeDomainPath('/')).toBe('/')
  })

  it('limits merchant domain paths to root or one clean segment', () => {
    expect(validateDomainPath('/')).toEqual({ ok: true, value: '/' })
    expect(validateDomainPath('/pricing')).toEqual({ ok: true, value: '/pricing' })
    expect(validateDomainPath('/abcd')).toMatchObject({ ok: false })
    expect(validateDomainPath('/nested/path')).toMatchObject({ ok: false })
    expect(validateDomainPath('/.well-known')).toMatchObject({ ok: false })
  })
})

describe('resolveDomainPath', () => {
  it('maps root + root artifacts', () => {
    expect(resolveDomainPath('/')).toEqual({ basePath: '/', artifact: null })
    expect(resolveDomainPath('/agent.json')).toEqual({ basePath: '/', artifact: 'agent.json' })
    expect(resolveDomainPath('/mcp.json')).toEqual({ basePath: '/', artifact: 'mcp.json' })
  })
  it('maps subpaths + their artifacts', () => {
    expect(resolveDomainPath('/pricing')).toEqual({ basePath: '/pricing', artifact: null })
    expect(resolveDomainPath('/pricing/')).toEqual({ basePath: '/pricing', artifact: null })
    expect(resolveDomainPath('/pricing/agent.json')).toEqual({ basePath: '/pricing', artifact: 'agent.json' })
  })
  it('maps llms.txt at root and subpath', () => {
    expect(resolveDomainPath('/llms.txt')).toEqual({ basePath: '/', artifact: 'llms.txt' })
    expect(resolveDomainPath('/pricing/llms.txt')).toEqual({ basePath: '/pricing', artifact: 'llms.txt' })
  })
  it('maps openapi.json at root and subpath', () => {
    expect(resolveDomainPath('/openapi.json')).toEqual({ basePath: '/', artifact: 'openapi.json' })
    expect(resolveDomainPath('/pricing/openapi.json')).toEqual({ basePath: '/pricing', artifact: 'openapi.json' })
  })
  it('returns null for unowned paths', () => {
    expect(resolveDomainPath('/checkout/x')).toBeNull()
    expect(resolveDomainPath('/a/b/c')).toBeNull()
  })
})

describe('buildCustomDomainRewrite - llms.txt', () => {
  const map = { '/': 'home-slug', '/pricing': 'pricing-slug' }
  it('rewrites root + subpath llms.txt to per-slug llms.txt', () => {
    expect(buildCustomDomainRewrite(map, '/llms.txt')).toBe('/home-slug/llms.txt')
    expect(buildCustomDomainRewrite(map, '/pricing/llms.txt')).toBe('/pricing-slug/llms.txt')
  })
})

describe('mapCustomDomainPath - llms.txt', () => {
  it('maps /llms.txt to the per-slug route', () => {
    expect(mapCustomDomainPath('acme', '/llms.txt')).toBe('/acme/llms.txt')
  })
})

describe('buildCustomDomainRewrite', () => {
  const map = { '/': 'home-slug', '/pricing': 'pricing-slug' }
  it('rewrites root + subpaths to their slugs', () => {
    expect(buildCustomDomainRewrite(map, '/')).toBe('/home-slug')
    expect(buildCustomDomainRewrite(map, '/pricing')).toBe('/pricing-slug')
  })
  it('rewrites artifacts to per-slug artifact paths', () => {
    expect(buildCustomDomainRewrite(map, '/agent.json')).toBe('/home-slug/agent.json')
    expect(buildCustomDomainRewrite(map, '/pricing/mcp.json')).toBe('/pricing-slug/mcp.json')
    expect(buildCustomDomainRewrite(map, '/openapi.json')).toBe('/home-slug/openapi.json')
    expect(buildCustomDomainRewrite(map, '/pricing/openapi.json')).toBe('/pricing-slug/openapi.json')
  })
  it('returns null when path not mapped or unowned', () => {
    expect(buildCustomDomainRewrite(map, '/unknown')).toBeNull()
    expect(buildCustomDomainRewrite(map, '/checkout/x')).toBeNull()
  })
  it('still accepts a Map as well as a plain object', () => {
    const asMap = new Map([['/', 'home-slug'], ['/pricing', 'pricing-slug']])
    expect(buildCustomDomainRewrite(asMap, '/')).toBe('/home-slug')
    expect(buildCustomDomainRewrite(asMap, '/pricing/mcp.json')).toBe('/pricing-slug/mcp.json')
    expect(buildCustomDomainRewrite(asMap, '/.well-known/ai-catalog.json')).toBe('/home-slug/ai-catalog.json')
  })
})

describe('.well-known discovery-probe parity (P2)', () => {
  const map = { '/': 'home-slug' }

  it('resolveDomainPath treats /.well-known/agent.json + mcp.json as ROOT artifacts', () => {
    expect(resolveDomainPath('/.well-known/agent.json')).toEqual({ basePath: '/', artifact: 'agent.json' })
    expect(resolveDomainPath('/.well-known/mcp.json')).toEqual({ basePath: '/', artifact: 'mcp.json' })
  })

  it('does NOT treat .well-known as a sub-page basePath', () => {
    // The generic /<seg>/<artifact> rule must not fire - .well-known is not a listing.
    const resolved = resolveDomainPath('/.well-known/agent.json')
    expect(resolved?.basePath).not.toBe('/.well-known')
  })

  it('only agent.json + mcp.json live under /.well-known (llms/openapi do not)', () => {
    // llms.txt/openapi.json aren't conventionally under /.well-known -> unowned.
    expect(resolveDomainPath('/.well-known/llms.txt')).toBeNull()
    expect(resolveDomainPath('/.well-known/openapi.json')).toBeNull()
    expect(resolveDomainPath('/.well-known/random.json')).toBeNull()
  })

  it('the proxy rewrite answers the probe with the listing manifest', () => {
    expect(buildCustomDomainRewrite(map, '/.well-known/agent.json')).toBe('/home-slug/agent.json')
    expect(buildCustomDomainRewrite(map, '/.well-known/mcp.json')).toBe('/home-slug/mcp.json')
  })

  it('mapCustomDomainPath maps the well-known probe paths too', () => {
    expect(mapCustomDomainPath('acme', '/.well-known/agent.json')).toBe('/acme/agent.json')
    expect(mapCustomDomainPath('acme', '/.well-known/mcp.json')).toBe('/acme/mcp.json')
    expect(mapCustomDomainPath('acme', '/.well-known/llms.txt')).toBe('/.well-known/llms.txt') // passthrough
  })
})

describe('ARD catalog is a domain-scoped well-known artifact', () => {
  const rootDomain = { '/': 'home-slug', '/pricing': 'pricing-slug' }

  it('rewrites the spec path to the listing catalog route', () => {
    expect(buildCustomDomainRewrite(rootDomain, '/.well-known/ai-catalog.json')).toBe('/home-slug/ai-catalog.json')
  })

  it('regression: the probe no longer falls through to a platform redirect', () => {
    // Before this existed, resolveDomainPath returned null for the catalog path,
    // the proxy 308'd to nexez.app, and a merchant-domain probe answered with the
    // WHOLE platform catalog. Null here means that redirect is back.
    expect(buildCustomDomainRewrite(rootDomain, '/.well-known/ai-catalog.json')).not.toBeNull()
  })

  it('resolves for a domain that hosts only sub-pages (no root listing)', () => {
    // Entry-point fallback: any listing on the host can anchor the catalog, since
    // the route re-resolves the full set from the Host header.
    const subOnly = { '/pricing': 'pricing-slug', '/booking': 'booking-slug' }
    expect(buildCustomDomainRewrite(subOnly, '/.well-known/ai-catalog.json')).toBe('/booking-slug/ai-catalog.json')
  })

  it('is deterministic when several sub-pages could anchor it', () => {
    const subOnly = { '/pricing': 'pricing-slug', '/booking': 'booking-slug' }
    const first = buildCustomDomainRewrite(subOnly, '/.well-known/ai-catalog.json')
    const second = buildCustomDomainRewrite({ '/booking': 'booking-slug', '/pricing': 'pricing-slug' }, '/.well-known/ai-catalog.json')
    expect(first).toBe(second)
  })

  it('returns null for a domain with no listings at all', () => {
    expect(buildCustomDomainRewrite({}, '/.well-known/ai-catalog.json')).toBeNull()
  })

  it('tolerates a trailing slash on the probe path', () => {
    expect(buildCustomDomainRewrite(rootDomain, '/.well-known/ai-catalog.json/')).toBe('/home-slug/ai-catalog.json')
  })

  it('is NOT served at the domain root or under a sub-page', () => {
    // ARD fixes the location at /.well-known/. Anything else stays unowned so we
    // do not invent a second address for the same document.
    expect(buildCustomDomainRewrite(rootDomain, '/ai-catalog.json')).toBeNull()
    expect(buildCustomDomainRewrite(rootDomain, '/pricing/ai-catalog.json')).toBeNull()
    expect(resolveDomainPath('/ai-catalog.json')).toEqual({ basePath: '/ai-catalog.json', artifact: null })
  })

  it('does not widen the other well-known paths', () => {
    expect(buildCustomDomainRewrite(rootDomain, '/.well-known/llms.txt')).toBeNull()
    expect(buildCustomDomainRewrite(rootDomain, '/.well-known/security.txt')).toBeNull()
  })

  it('mapCustomDomainPath maps it for the legacy single-page path', () => {
    expect(mapCustomDomainPath('acme', '/.well-known/ai-catalog.json')).toBe('/acme/ai-catalog.json')
  })
})

// Seven production runtime error groups came from a trailing encoded backslash on
// the discovery artifact paths. The path reached the Next.js launcher, which threw
// MODULE_NOT_FOUND on `pages/agent.json%5C.js` instead of answering 404.
describe('isMalformedRequestPath', () => {
  it('rejects the trailing encoded backslash that caused the production errors', () => {
    expect(isMalformedRequestPath('/agent.json%5C')).toBe(true)
    expect(isMalformedRequestPath('/agent-pages.json%5C')).toBe(true)
    expect(isMalformedRequestPath('/.well-known/nexez.json%5C')).toBe(true)
  })

  it('rejects a lowercase or literal backslash just the same', () => {
    expect(isMalformedRequestPath('/agent.json%5c')).toBe(true)
    expect(isMalformedRequestPath('/agent.json\\')).toBe(true)
  })

  it('rejects encoded control characters', () => {
    expect(isMalformedRequestPath('/agent.json%00')).toBe(true)
    expect(isMalformedRequestPath('/agent.json%0A')).toBe(true)
    expect(isMalformedRequestPath('/agent.json%7F')).toBe(true)
  })

  it('rejects a path that cannot be percent-decoded at all', () => {
    expect(isMalformedRequestPath('/agent.json%ZZ')).toBe(true)
    expect(isMalformedRequestPath('/%E0%A4%A')).toBe(true)
  })

  it('leaves every legitimate path alone', () => {
    expect(isMalformedRequestPath('/')).toBe(false)
    expect(isMalformedRequestPath('/agent.json')).toBe(false)
    expect(isMalformedRequestPath('/.well-known/ai-catalog.json')).toBe(false)
    expect(isMalformedRequestPath('/pricing/mcp.json')).toBe(false)
    // Percent-encoding is fine in itself: only what it decodes to matters.
    expect(isMalformedRequestPath('/caf%C3%A9')).toBe(false)
    expect(isMalformedRequestPath('/a%20b')).toBe(false)
  })

  it('treats empty input as unremarkable rather than malformed', () => {
    expect(isMalformedRequestPath('')).toBe(false)
    expect(isMalformedRequestPath(null)).toBe(false)
    expect(isMalformedRequestPath(undefined)).toBe(false)
  })
})

describe('malformed paths never become a rewrite target', () => {
  const domain = { '/': 'acme', '/pricing': 'acme-pricing' }

  it('resolveDomainPath returns null instead of inventing a basePath', () => {
    expect(resolveDomainPath('/agent.json%5C')).toBeNull()
    expect(resolveDomainPath('/pricing%5C/agent.json')).toBeNull()
  })

  it('buildCustomDomainRewrite passes through rather than rewriting', () => {
    expect(buildCustomDomainRewrite(domain, '/agent.json%5C')).toBeNull()
    expect(buildCustomDomainRewrite(domain, '/.well-known/ai-catalog.json%5C')).toBeNull()
    expect(buildCustomDomainRewrite(domain, '/mcp%5C')).toBeNull()
    // The clean equivalents still resolve, so the guard is not over-broad.
    expect(buildCustomDomainRewrite(domain, '/agent.json')).toBe('/acme/agent.json')
    expect(buildCustomDomainRewrite(domain, '/.well-known/ai-catalog.json')).toBe('/acme/ai-catalog.json')
  })
})
