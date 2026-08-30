import { describe, expect, it } from 'vitest'
import type { AgentPage } from '@/src/types/nexez'
import { buildPortfolioReadinessComparison } from './portfolio-readiness'

function page(id: string, name: string, patch: Partial<AgentPage> = {}): AgentPage {
  return {
    id,
    name,
    slug: `${id}-listing`,
    description: null,
    website_url: null,
    cta_url: null,
    cta_label: null,
    audience: null,
    location: null,
    contact_email: null,
    products: null,
    services: null,
    faqs: null,
    is_published: true,
    ...patch,
  }
}

describe('portfolio readiness comparison', () => {
  it('ranks owner listings and labels every score relative to the selected listing', () => {
    const selected = page('selected', 'Selected', {
      description: 'A complete description of this business and the clients it serves.',
      products: [{ name: 'Starter', description: 'Starter offer', price: '$100' }],
    })
    const higher = page('higher', 'Higher', {
      description: 'A complete description of this business and the clients it serves.',
      products: [
        { name: 'Starter', description: 'Starter offer', price: '$100' },
        { name: 'Advanced', description: 'Advanced offer', price: '$250' },
      ],
      faqs: [{ question: 'How does this work?', answer: 'Choose an offer and contact us.' }],
    })
    const lower = page('lower', 'Lower')

    const result = buildPortfolioReadinessComparison([selected, lower, higher], selected.id)

    expect(result?.rows.map((row) => row.id)).toEqual(['higher', 'selected', 'lower'])
    expect(result?.rows.map((row) => [row.id, row.relation])).toEqual([
      ['higher', 'higher'],
      ['selected', 'selected'],
      ['lower', 'lower'],
    ])
    expect(result?.rows.find((row) => row.id === 'higher')?.offerCount).toBe(2)
  })

  it('preserves source order for equal readiness scores', () => {
    const selected = page('selected', 'Selected')
    const peer = page('peer', 'Peer')

    expect(buildPortfolioReadinessComparison([peer, selected], selected.id)?.rows).toMatchObject([
      { id: 'peer', relation: 'same' },
      { id: 'selected', relation: 'selected' },
    ])
  })

  it('fails closed when the selected listing is outside the owner-scoped portfolio', () => {
    expect(buildPortfolioReadinessComparison([page('owned', 'Owned')], 'shared')).toBeNull()
  })
})
