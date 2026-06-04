import { describe, expect, it } from 'vitest'
import { buildAgentPagePayload, getAgentJsonPath } from '../agent-manifest'
import type { AgentPage } from '../agent-page'

const page = {
  id: 'p', name: 'Acme', slug: 'acme', description: 'desc', is_published: true,
  website_url: 'https://acme.com', updated_at: '2026-06-01T00:00:00Z',
  services: [{ name: 'Consult', description: 'A consult', price: '$100', url: '', availability: 'limited' }],
  products: [], faqs: [{ question: 'q', answer: 'a' }],
} as unknown as AgentPage

describe('buildAgentPagePayload', () => {
  const payload = buildAgentPagePayload(page) as any

  it('emits schema version, last_updated, and page identity', () => {
    expect(payload.schema_version).toBe('nexez.agent-page.v1')
    expect(payload.last_updated).toBe('2026-06-01T00:00:00Z')
    expect(payload.page.name).toBe('Acme')
    expect(payload.page.slug).toBe('acme')
  })

  it('includes offers with availability + checkout action', () => {
    expect(payload.offers.length).toBe(1)
    expect(payload.offers[0].availability).toBe('limited')
    expect(payload.offers[0].action.endpoint).toContain('/api/checkout')
  })

  it('includes a plain_text block for LLMs', () => {
    expect(typeof payload.plain_text).toBe('string')
    expect(payload.plain_text).toContain('Acme')
  })
})

describe('getAgentJsonPath', () => {
  it('builds the per-slug agent.json path', () => {
    expect(getAgentJsonPath('acme')).toBe('/acme/agent.json')
  })
})
