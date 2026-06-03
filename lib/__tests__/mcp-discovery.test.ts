import { describe, expect, it } from 'vitest'
import { buildMcpDiscoveryCatalog, buildMcpDiscoveryPage, McpDiscoveryPage } from '../mcp-discovery'

const page: McpDiscoveryPage = {
  name: 'Acme Consulting',
  slug: 'acme',
  description: 'Strategy services for operators',
  location: 'Remote',
  products: [{ name: 'Playbook', description: 'Operating playbook', price: '$99', url: '' }],
  services: [{ name: 'Strategy Session', description: 'One hour strategy call', price: '$299', url: '' }],
  created_at: '2026-06-03T00:00:00.000Z',
  mcp_enabled: true,
}

describe('MCP discovery helpers', () => {
  it('builds a discoverable page entry with MCP and checkout links', () => {
    const entry = buildMcpDiscoveryPage(page, 'https://nexez.test')

    expect(entry).toMatchObject({
      name: 'Acme Consulting',
      slug: 'acme',
      mcp_manifest_url: 'https://nexez.test/acme/mcp.json',
      agent_json_url: 'https://nexez.test/acme/agent.json',
      offer_count: 2,
      capabilities: {
        tools: ['book_offer'],
        checkout_dry_run: true,
      },
    })
    expect(entry.offers.map((offer) => offer.offer_key)).toEqual(['services-0', 'products-0'])
  })

  it('only includes MCP-enabled pages in the global catalog', () => {
    const catalog = buildMcpDiscoveryCatalog(
      [page, { ...page, slug: 'draft', mcp_enabled: false }],
      'https://nexez.test',
      '2026-06-03T00:00:00.000Z',
    )

    expect(catalog.page_count).toBe(1)
    expect(catalog.pages).toHaveLength(1)
    expect(catalog.pages[0].slug).toBe('acme')
    expect(catalog.llms_url).toBe('https://nexez.test/llms.txt')
  })
})
