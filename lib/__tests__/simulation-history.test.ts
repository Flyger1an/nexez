import { describe, expect, it } from 'vitest'
import { AgentPage } from '../agent-page'
import {
  buildSimulationHistoryEntry,
  exportSimulationHistory,
  filterSimulationHistory,
  getSimulationHistoryStats,
  normalizeSimulatorTarget,
} from '../simulation-history'

const page: AgentPage = {
  id: 'page-1',
  owner_id: 'owner-1',
  name: 'Acme Consulting',
  slug: 'acme',
  description: 'Strategy services for operators',
  website_url: 'https://acme.test',
  cta_url: 'https://acme.test/book',
  cta_label: 'Book now',
  audience: 'Founders',
  location: 'Remote',
  contact_email: 'hello@acme.test',
  industry: 'consulting',
  products: [],
  services: [{ name: 'Strategy Session', description: 'One hour strategy call', price: '$299', url: '' }],
  faqs: [{ question: 'How soon?', answer: 'This week.' }],
  is_published: true,
  created_at: new Date().toISOString(),
}

describe('simulation history helpers', () => {
  it('normalizes pasted slugs and URLs into public page slugs', () => {
    expect(normalizeSimulatorTarget(' acme ')).toBe('acme')
    expect(normalizeSimulatorTarget('/acme?ref=test')).toBe('acme')
    expect(normalizeSimulatorTarget('https://nexez.com/acme?agent=chatgpt')).toBe('acme')
    expect(normalizeSimulatorTarget('nexez.com/acme')).toBe('acme')
  })

  it('builds replayable multi-agent history entries', () => {
    const entry = buildSimulationHistoryEntry(page, 'Book a strategy session')

    expect(entry.agent).toBe('Multi-agent')
    expect(entry.query).toBe('Book a strategy session')
    expect(entry.result.results).toHaveLength(5)
    expect(entry.result.recommendations).toEqual([])
    expect(entry.readiness).toBeGreaterThan(80)
  })

  it('filters and exports history with useful stats', () => {
    const now = new Date().toISOString()
    const entries = [
      { ...buildSimulationHistoryEntry(page, 'Find consulting'), id: 'a', timestamp: now, readiness: 91 },
      { ...buildSimulationHistoryEntry(page, 'Book coaching'), id: 'b', timestamp: now, readiness: 82 },
    ]

    expect(filterSimulationHistory(entries, 'coaching')).toHaveLength(1)
    expect(getSimulationHistoryStats(entries)).toMatchObject({
      totalRuns: 2,
      latestReadiness: 91,
      averageReadiness: 87,
      readinessDelta: 9,
      latestQuery: 'Find consulting',
    })
    expect(exportSimulationHistory(entries, page)).toMatchObject({
      page: { name: 'Acme Consulting', slug: 'acme' },
      stats: { totalRuns: 2 },
    })
  })
})
