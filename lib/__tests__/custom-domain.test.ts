import { describe, expect, it } from 'vitest'
import {
  agentArtifactHref,
  buildCustomDomainRewrite,
  getEffectiveBaseUrl,
  hostLookupCandidates,
  isCustomHost,
  isPlatformHost,
  mapCustomDomainPath,
  normalizeDomainPath,
  normalizeHost,
  resolveDomainPath,
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
  })
  it('passes non-artifact paths through unchanged', () => {
    expect(mapCustomDomainPath('acme-plumbing', '/checkout/acme-plumbing')).toBe('/checkout/acme-plumbing')
    expect(mapCustomDomainPath('acme-plumbing', '/openapi.json')).toBe('/openapi.json')
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
  it('returns null for unowned paths', () => {
    expect(resolveDomainPath('/checkout/x')).toBeNull()
    expect(resolveDomainPath('/a/b/c')).toBeNull()
  })
})

describe('buildCustomDomainRewrite — llms.txt', () => {
  const map = { '/': 'home-slug', '/pricing': 'pricing-slug' }
  it('rewrites root + subpath llms.txt to per-slug llms.txt', () => {
    expect(buildCustomDomainRewrite(map, '/llms.txt')).toBe('/home-slug/llms.txt')
    expect(buildCustomDomainRewrite(map, '/pricing/llms.txt')).toBe('/pricing-slug/llms.txt')
  })
})

describe('mapCustomDomainPath — llms.txt', () => {
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
  })
  it('returns null when path not mapped or unowned', () => {
    expect(buildCustomDomainRewrite(map, '/unknown')).toBeNull()
    expect(buildCustomDomainRewrite(map, '/checkout/x')).toBeNull()
  })
})
