import { describe, expect, it } from 'vitest'
import { searchAgentPages } from '../agent-search'
import type { AgentPage } from '../agent-page'

function mk(over: Partial<AgentPage>): AgentPage {
  return { id: over.slug, name: over.slug, slug: over.slug, is_published: true, services: [], products: [], faqs: [], ...over } as AgentPage
}

describe('searchAgentPages', () => {
  const plumber = mk({ slug: 'acme-plumb', name: 'Acme Plumbing', description: 'Emergency plumbing and drain cleaning', services: [{ name: 'Drain cleaning', description: 'clear blocked drains', price: '$120', url: '' }] })
  const massage = mk({ slug: 'zen-spa', name: 'Zen Spa', description: 'Relaxing massage therapy', services: [{ name: 'Deep tissue massage', description: 'therapeutic', price: '$90', url: '' }] })

  it('ranks the relevant page first by query match', () => {
    const res = searchAgentPages([massage, plumber], 'drain cleaning')
    expect(res[0].page.slug).toBe('acme-plumb')
  })

  it('returns offer-level results with checkout actions', () => {
    const res = searchAgentPages([plumber], 'plumbing')
    expect(res[0].offer?.checkout_url).toContain('/checkout/acme-plumb')
    expect(res[0].offer?.action.endpoint).toContain('/api/checkout')
  })

  it('breaks ties toward higher readiness (quality-aware)', () => {
    // Two equally-irrelevant pages (empty query → score 1 each); the more complete one ranks first.
    const bare = mk({ slug: 'bare', name: 'Bare', services: [] })
    const rich = mk({ slug: 'rich', name: 'Rich', description: 'd', website_url: 'https://r.com', cta_url: 'https://r.com/b', audience: 'a', industry: 'i', location: 'NYC', contact_email: 'e@r.com', faqs: [{ question: 'q', answer: 'a' }], services: [{ name: 's', description: '', price: '', url: '' }] })
    const res = searchAgentPages([bare, rich], '')
    expect(res[0].page.slug).toBe('rich')
  })

  it('respects the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => mk({ slug: `p${i}`, name: `P${i}` }))
    expect(searchAgentPages(many, '', 5)).toHaveLength(5)
  })
})
