import { describe, expect, it } from 'vitest'
import { buildAgentReadyKit } from '../agent-ready-kit'
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
})
