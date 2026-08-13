import { describe, expect, it } from 'vitest'
import { buildCustomDomainRewrite, mapCustomDomainPath, resolveDomainPath } from '../custom-domain'

/**
 * The live JSON-RPC MCP server on a brand domain. Separate from the static
 * artifact tests because this is a server, not a file: it is matched outside
 * DOMAIN_ARTIFACTS and has its own collision rule.
 */
describe('live /mcp endpoint on brand domains', () => {
  const map = { '/': 'home-slug', '/pricing': 'pricing-slug' }

  it('routes /mcp to the root listing server', () => {
    expect(buildCustomDomainRewrite(map, '/mcp')).toBe('/home-slug/mcp')
  })

  it('routes /<domain_path>/mcp to that listing server', () => {
    expect(buildCustomDomainRewrite(map, '/pricing/mcp')).toBe('/pricing-slug/mcp')
  })

  it('regression: the endpoint used to 308 to the platform', () => {
    // Previously resolveDomainPath returned { basePath: '/mcp' }, no listing
    // matched, and the proxy redirected. Agents only reached the server because
    // they follow redirects, paying a cross-origin hop on every call.
    expect(buildCustomDomainRewrite(map, '/mcp')).not.toBeNull()
  })

  it('does not shadow a merchant whose domain_path is literally /mcp', () => {
    // Registered paths win. That merchant keeps their page at /mcp, and their
    // listing's server stays reachable one level down.
    const collide = { '/': 'home-slug', '/mcp': 'mcp-slug' }
    expect(buildCustomDomainRewrite(collide, '/mcp')).toBe('/mcp-slug')
    expect(buildCustomDomainRewrite(collide, '/mcp/mcp')).toBe('/mcp-slug/mcp')
  })

  it('returns null when the domain has no matching listing', () => {
    expect(buildCustomDomainRewrite({ '/pricing': 'p' }, '/mcp')).toBeNull()
    expect(buildCustomDomainRewrite({}, '/mcp')).toBeNull()
  })

  it('never treats /.well-known/mcp as the live endpoint', () => {
    expect(buildCustomDomainRewrite(map, '/.well-known/mcp')).toBeNull()
  })

  it('does not fire on deeper paths', () => {
    expect(buildCustomDomainRewrite(map, '/a/b/mcp')).toBeNull()
  })

  it('leaves the static mcp.json artifact alone', () => {
    expect(buildCustomDomainRewrite(map, '/mcp.json')).toBe('/home-slug/mcp.json')
    expect(buildCustomDomainRewrite(map, '/pricing/mcp.json')).toBe('/pricing-slug/mcp.json')
    expect(resolveDomainPath('/mcp.json')).toEqual({ basePath: '/', artifact: 'mcp.json' })
  })

  it('tolerates a trailing slash', () => {
    expect(buildCustomDomainRewrite(map, '/mcp/')).toBe('/home-slug/mcp')
  })

  it('maps in the legacy single-page helper too', () => {
    expect(mapCustomDomainPath('acme', '/mcp')).toBe('/acme/mcp')
  })
})
