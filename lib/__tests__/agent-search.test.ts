import { describe, expect, it } from 'vitest'
import { analyzeQueryRank, searchAgentPages } from '../agent-search'
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
    expect(res[0].marketplace?.offer_count).toBe(1)
    expect(res[0].marketplace?.supports_checkout).toBe(true)
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

  it('adds location match metadata when a location filter is supplied', () => {
    const res = searchAgentPages([plumber], 'drain cleaning', 10, 'https://nexez.test', { location: 'NYC' })
    expect(res[0].location_match?.active).toBe(true)
    expect(res[0].location_match?.matched).toBe(false)

    const ny = mk({ slug: 'ny-page', name: 'NY Page', location: 'New York, NY', services: [{ name: 'Strategy', description: 'planning', price: '$200', url: '' }] })
    const nyRes = searchAgentPages([ny], 'strategy', 10, 'https://nexez.test', { location: 'NYC' })
    expect(nyRes[0].location_match?.matched).toBe(true)
  })
})

describe('analyzeQueryRank (win-the-query)', () => {
  const strong = mk({
    slug: 'acme-plumb',
    name: 'Acme Plumbing',
    description: 'Emergency drain cleaning',
    audience: 'homeowners',
    website_url: 'https://a.com',
    cta_url: 'https://a.com/book',
    industry: 'home services',
    location: 'NYC',
    contact_email: 'e@a.com',
    faqs: [{ question: 'q', answer: 'a' }],
    services: [{ name: 'Emergency drain cleaning', description: 'clear blocked drains fast', price: '$120', url: '' }],
  })
  const weak = mk({
    slug: 'bob-pipes',
    name: 'Bob Pipes',
    description: 'plumbing',
    services: [{ name: 'Pipe work', description: 'general', price: '', url: '' }],
  })

  it('ranks the stronger, more complete page above the weaker one', () => {
    const a = analyzeQueryRank([strong, weak], strong, 'emergency drain cleaning')
    expect(a.rank).toBe(1)
    const b = analyzeQueryRank([strong, weak], weak, 'emergency drain cleaning')
    expect(b.rank).toBeGreaterThan(1)
    expect(b.competitorsAbove[0].slug).toBe('acme-plumb')
  })

  it('surfaces the exact query terms a rival matches that you miss', () => {
    const b = analyzeQueryRank([strong, weak], weak, 'emergency drain cleaning')
    // weak page never mentions "emergency", "drain", or "cleaning"
    expect(b.termsToAdd).toEqual(expect.arrayContaining(['emergency', 'drain', 'cleaning']))
    expect(b.toWin.join(' ')).toMatch(/emergency|drain|cleaning/i)
  })

  it('reports matched=false and a concrete fix when the page does not surface at all', () => {
    const a = analyzeQueryRank([strong], weak, 'wedding photography')
    expect(a.matched).toBe(false)
    expect(a.toWin.join(' ')).toMatch(/doesn't surface/i)
  })

  it('flags an unpublished target as a projected (not real) rank', () => {
    const draft = mk({ ...strong, slug: 'draft-co', is_published: false })
    const a = analyzeQueryRank([strong, weak], draft, 'drain cleaning')
    expect(a.published).toBe(false)
    expect(a.toWin.join(' ')).toMatch(/unpublished|projected/i)
  })

  it('tells a #1 page to hold its lead', () => {
    const a = analyzeQueryRank([weak], strong, 'emergency drain cleaning')
    expect(a.rank).toBe(1)
    expect(a.toWin.join(' ')).toMatch(/#1|hold/i)
  })
})
