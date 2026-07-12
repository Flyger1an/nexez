import { describe, expect, it } from 'vitest'
import { buildAgentReadyKit, buildArtifactRedirects, buildRedirectRecipes, buildCodeInjectionRecipes } from '../agent-ready-kit'
import type { AgentPage } from '../agent-page'

function page(over: Partial<AgentPage> = {}): AgentPage {
  return {
    id: 'p1',
    name: 'Acme Plumbing',
    slug: 'acme-plumbing',
    description: 'Emergency plumbing and drain services.',
    is_published: true,
    services: [{ name: 'Drain cleaning', price: '$120', description: 'Fast drain clearing', availability: 'in_stock' }],
    products: [],
    faqs: [],
    ...over,
  } as AgentPage
}

const BASE = 'https://nexez.app'

describe('buildAgentReadyKit', () => {
  it('returns all six blocks, each anchored at baseUrl/<slug>', () => {
    const kit = buildAgentReadyKit(page(), { baseUrl: BASE })
    expect(kit.map((b) => b.id).sort()).toEqual(
      ['badge', 'head_link', 'jsonld', 'llms_txt', 'well_known_agent_json', 'widget'],
    )
    for (const block of kit) {
      expect(block.title).toBeTruthy()
      expect(block.description).toBeTruthy()
      expect(block.content).toBeTruthy()
      expect(block.content).not.toContain('undefined')
    }
    // Every listing URL points at the existing listing artifacts.
    const joined = kit.map((b) => b.content).join('\n')
    expect(joined).toContain('https://nexez.app/acme-plumbing/agent.json')
    expect(joined).toContain('https://nexez.app/acme-plumbing/llms.txt')
    expect(joined).toContain('https://nexez.app/acme-plumbing/badge.svg')
  })

  it('jsonld block wraps parseable schema.org data with the offers, no raw </script>', () => {
    const kit = buildAgentReadyKit(page(), { baseUrl: BASE })
    const jsonld = kit.find((b) => b.id === 'jsonld')!
    expect(jsonld.content.startsWith('<script type="application/ld+json">')).toBe(true)
    expect(jsonld.content.endsWith('</script>')).toBe(true)
    const inner = jsonld.content.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '')
    // safeJsonScript escapes </script> in the payload so it can't break out.
    expect(inner).not.toContain('</script>')
    const parsed = JSON.parse(inner)
    expect(parsed['@context']).toBe('https://schema.org')
    expect(parsed.mainEntity.makesOffer.length).toBe(1)
    expect(parsed.mainEntity.makesOffer[0].name).toBe('Drain cleaning')
  })

  it('well-known pointer is valid JSON with the pointer schema version', () => {
    const kit = buildAgentReadyKit(page(), { baseUrl: BASE })
    const pointer = JSON.parse(kit.find((b) => b.id === 'well_known_agent_json')!.content)
    expect(pointer.schema_version).toBe('nexez.agent-pointer.v1')
    expect(pointer.agent_json_url).toBe('https://nexez.app/acme-plumbing/agent.json')
  })

  it('escapes the business name in the head_link title attribute (no markup break / attribute injection)', () => {
    const kit = buildAgentReadyKit(page({ name: 'Ray\'s "Auto" & Tire <x" onmouseover=alert(1)' }), { baseUrl: BASE })
    const link = kit.find((b) => b.id === 'head_link')!
    // The raw quote/angle/amp must be entity-encoded so the title attribute can't terminate early.
    expect(link.content).toContain('&quot;')
    expect(link.content).toContain('&amp;')
    expect(link.content).toContain('&lt;')
    // The title value must contain NO raw double-quote (the crafted `x" onmouseover=`
    // can't terminate the attribute + inject a new one). `onmouseover` may survive as
    // inert escaped TEXT inside the value — what matters is the quote is neutralized.
    const title = link.content.match(/title="([^"]*)"/)
    expect(title).not.toBeNull()
    expect(title![1]).not.toContain('"') // no bare quote → no attribute break-out
    expect(title![1]).toContain('&quot;Auto&quot;')
  })

  it('is deterministic (pure) — same input, identical output', () => {
    const a = buildAgentReadyKit(page(), { baseUrl: BASE })
    const b = buildAgentReadyKit(page(), { baseUrl: BASE })
    expect(a).toEqual(b)
  })

  it('relabels the .well-known block as a static fallback (redirect preferred)', () => {
    const block = buildAgentReadyKit(page(), { baseUrl: BASE }).find((b) => b.id === 'well_known_agent_json')!
    expect(block.title).toMatch(/fallback/i)
    expect(block.description.toLowerCase()).toContain('redirect')
  })
})

describe('buildArtifactRedirects', () => {
  it('maps the well-known + core artifact paths to the live listing (301 targets)', () => {
    const map = Object.fromEntries(buildArtifactRedirects(page(), { baseUrl: BASE }).map((r) => [r.from, r.to]))
    expect(map['/.well-known/agent.json']).toBe('https://nexez.app/acme-plumbing/agent.json')
    expect(map['/agent.json']).toBe('https://nexez.app/acme-plumbing/agent.json')
    expect(map['/llms.txt']).toBe('https://nexez.app/acme-plumbing/llms.txt')
    expect(map['/openapi.json']).toBe('https://nexez.app/acme-plumbing/openapi.json')
    expect(map['/mcp.json']).toBeUndefined() // not mcp_enabled
  })

  it('includes /mcp.json only when the listing has MCP enabled', () => {
    const rules = buildArtifactRedirects(page({ mcp_enabled: true } as Partial<AgentPage>), { baseUrl: BASE })
    expect(rules.some((r) => r.from === '/mcp.json' && r.to === 'https://nexez.app/acme-plumbing/mcp.json')).toBe(true)
  })
})

describe('buildRedirectRecipes', () => {
  it('emits a recipe per host stack, each carrying every live 301 target', () => {
    const recipes = buildRedirectRecipes(page(), { baseUrl: BASE })
    expect(recipes.map((r) => r.id).sort()).toEqual(['apache', 'cloudflare', 'netlify', 'nginx', 'vercel'])
    for (const r of recipes) {
      expect(r.filename).toBeTruthy()
      expect(r.content).not.toContain('undefined')
      expect(r.content).toContain('https://nexez.app/acme-plumbing/agent.json')
      expect(r.content).toContain('https://nexez.app/acme-plumbing/llms.txt')
    }
  })

  it('vercel recipe is valid JSON with permanent redirects', () => {
    const vercel = JSON.parse(buildRedirectRecipes(page(), { baseUrl: BASE }).find((r) => r.id === 'vercel')!.content)
    expect(Array.isArray(vercel.redirects)).toBe(true)
    expect(vercel.redirects[0].permanent).toBe(true)
    expect(vercel.redirects.every((x: { destination: string }) => x.destination.startsWith('https://nexez.app/acme-plumbing/'))).toBe(true)
  })

  it('cloudflare recipe redirects with a 301', () => {
    const cf = buildRedirectRecipes(page(), { baseUrl: BASE }).find((r) => r.id === 'cloudflare')!.content
    expect(cf).toContain('Response.redirect')
    expect(cf).toContain('301')
    expect(cf).toContain('/.well-known/agent.json')
  })

  it('is deterministic (pure)', () => {
    expect(buildRedirectRecipes(page(), { baseUrl: BASE })).toEqual(buildRedirectRecipes(page(), { baseUrl: BASE }))
  })
})

describe('buildCodeInjectionRecipes (hosted builders)', () => {
  it('covers Wix, Squarespace, and a generic fallback', () => {
    const recipes = buildCodeInjectionRecipes(page(), { baseUrl: BASE })
    expect(recipes.map((r) => r.id)).toEqual(['wix', 'squarespace', 'generic'])
    for (const r of recipes) {
      expect(r.title).toBeTruthy()
      expect(r.instructions).toBeTruthy()
      expect(r.language).toBe('html')
    }
  })

  it('each recipe is the same head snippet: JSON-LD + manifest link anchored at the listing', () => {
    const recipes = buildCodeInjectionRecipes(page(), { baseUrl: BASE })
    const contents = new Set(recipes.map((r) => r.content))
    expect(contents.size).toBe(1) // identical head snippet across platforms
    const snippet = recipes[0].content
    expect(snippet).toContain('<script type="application/ld+json">')
    expect(snippet).toContain('<link rel="alternate" type="application/json"')
    expect(snippet).toContain(`${BASE}/${page().slug}/agent.json`)
  })

  it('escapes the business name in the manifest link attribute (no injection)', () => {
    const snippet = buildCodeInjectionRecipes(page({ name: 'Ray\'s "Auto" <x" onmouseover=alert(1)' }), { baseUrl: BASE })[0].content
    // The name's own <, " are escaped so they can't break OUT of the title attribute.
    expect(snippet).not.toContain('<x"')
    expect(snippet).toContain('&quot;')
    expect(snippet).toContain('&lt;x')
  })

  it('platform instructions name the right code-injection path', () => {
    const byId = Object.fromEntries(buildCodeInjectionRecipes(page(), { baseUrl: BASE }).map((r) => [r.id, r.instructions]))
    expect(byId.wix).toMatch(/Custom Code/i)
    expect(byId.squarespace).toMatch(/Code Injection/i)
  })

  it('is deterministic (pure)', () => {
    expect(buildCodeInjectionRecipes(page(), { baseUrl: BASE })).toEqual(buildCodeInjectionRecipes(page(), { baseUrl: BASE }))
  })
})
