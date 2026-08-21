import { describe, expect, it } from 'vitest'
import { analyzeQueryRank, searchAgentPages } from '../agent-search'
import type { AgentPage } from '../agent-page'
import type { ReviewSummary } from '../reviews'

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

  it('does not count a query token hidden inside an unrelated word', () => {
    const careProvider = mk({
      slug: 'care-provider',
      name: 'Care Provider',
      description: 'Personalized care and rental-property cleaning.',
      services: [{ name: 'Home Care', description: 'Care for occupied homes.', price: '$120', url: '' }],
    })

    expect(searchAgentPages([careProvider], 'car')).toEqual([])
  })

  it('keeps common service-language variants in the same token family', () => {
    const detailing = mk({
      slug: 'mobile-detailing',
      name: 'Mobile Detailing',
      services: [{ name: 'Vehicle Detailing', description: 'On-site service.', price: '$120', url: '' }],
    })

    const results = searchAgentPages([detailing], 'detailer')
    expect(results[0]?.page.slug).toBe('mobile-detailing')
    expect(results[0]?.matched_query_terms).toContain('detailer')
  })

  it('returns offer-level results with checkout actions', () => {
    const res = searchAgentPages([plumber], 'plumbing')
    expect(res[0].offer?.checkout_url).toContain('/checkout/acme-plumb')
    expect(res[0].offer?.action.endpoint).toContain('/api/checkout')
    expect(res[0].marketplace?.offer_count).toBe(1)
    expect(res[0].marketplace?.supports_checkout).toBe(true)
  })

  it('returns Shopify imports as products with their preferred provider checkout', () => {
    const shopifyUrl = 'https://nexez-tester.myshopify.com/products/agent-ready-cap'
    const shopify = mk({
      slug: 'shopify-store',
      name: 'Shopify Store',
      services: [{
        name: 'Agent-ready cap',
        description: 'A cap',
        price: '$30',
        url: shopifyUrl,
        source: 'shopify',
        prefer_original_for_this: true,
        metadata: { commerce_provider: 'shopify' },
      }],
    })

    const res = searchAgentPages([shopify], 'agent ready cap', 10, 'https://nexez.test')
    expect(res[0].offer).toMatchObject({
      type: 'product',
      checkout_url: shopifyUrl,
      provider_url: shopifyUrl,
    })
    expect(res[0].offer?.action.endpoint).toBe('https://nexez.test/api/checkout')
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

  it('adds storefront context when provided by the caller', () => {
    const res = searchAgentPages([plumber], 'plumbing', 10, 'https://nexez.test', {
      storefrontHandles: new Map([['acme-plumb', 'acme-store']]),
    })
    expect(res[0].page.storefront).toEqual({
      handle: 'acme-store',
      url: 'https://nexez.test/store/acme-store',
      agent_json_url: 'https://nexez.test/store/acme-store/agent.json',
    })
  })

  it('adds rating summaries and uses reputation as a quality tie-breaker', () => {
    const trusted = mk({ slug: 'trusted', name: 'Trusted', services: [{ name: 'Strategy', description: 'planning', price: '$200', url: '' }] })
    const unrated = mk({ slug: 'unrated', name: 'Unrated', services: [{ name: 'Strategy', description: 'planning', price: '$200', url: '' }] })
    const res = searchAgentPages([unrated, trusted], '', 10, 'https://nexez.test', {
      reviewSummaries: new Map([
        ['trusted', {
          average: 4.9,
          count: 20,
          verified_count: 20,
          reputation_score: 4.75,
          distribution: { '1': 0, '2': 0, '3': 0, '4': 2, '5': 18 },
          recent_positive_tags: [],
          recent_reviews: [],
        }],
      ]),
    })

    expect(res[0].page.slug).toBe('trusted')
    expect(res[0].page.rating_summary?.count).toBe(20)
  })

  it('filters on published marketplace signals and explains each match', () => {
    const negotiable = mk({
      slug: 'verified-strategy',
      name: 'Verified Strategy',
      industry: 'Management Consulting',
      custom_domain_verified: true,
      description: 'Strategy consulting for operators',
      services: [{
        name: 'Strategy sprint',
        description: 'Planning workshop',
        price: '$300',
        url: '',
        offerType: 'negotiable',
      }],
    })

    const res = searchAgentPages([plumber, negotiable], 'strategy workshop', 10, 'https://nexez.test', {
      industry: 'consulting',
      verified: true,
      supportsCheckout: true,
      supportsNegotiation: true,
      priceBand: '100_500',
    })

    expect(res).toHaveLength(1)
    expect(res[0].page.slug).toBe('verified-strategy')
    expect(res[0].matched_query_terms).toEqual(['strategy', 'workshop'])
    expect(res[0].match_reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/query terms/i),
      expect.stringMatching(/verification/i),
      expect.stringMatching(/negotiation/i),
    ]))
  })

  it('caps repeated keyword evidence so stuffing cannot beat an exact offer identity', () => {
    const stuffed = mk({
      slug: 'stuffed',
      name: 'Stuffed Co',
      description: Array(30).fill('plumber').join(' '),
    })
    const exact = mk({
      slug: 'exact',
      name: 'Exact Co',
      services: [{ name: 'Plumber', description: 'Home repair.', price: '$100', url: '' }],
    })

    const results = searchAgentPages([stuffed, exact], 'plumber')
    expect(results.map((result) => result.page.slug)).toEqual(['exact', 'stuffed'])
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('keeps relevance ahead of every quality signal', () => {
    const strongMatch = mk({
      slug: 'strong-match',
      name: 'Strong Match',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })
    const weakMatch = mk({
      slug: 'weak-match',
      name: 'Weak Match',
      description: 'Strategy support.',
      custom_domain_verified: true,
      updated_at: '2026-08-20T00:00:00.000Z',
      services: [{ name: 'Executive Workshop', description: 'Planning.', price: '$100', url: '', availability: 'available' }],
    })

    const results = searchAgentPages([weakMatch, strongMatch], 'strategy', 10, 'https://nexez.test', {
      now: new Date('2026-08-21T00:00:00.000Z'),
      reviewSummaries: new Map([['weak-match', reviewSummary(20, 4.8)]]),
    })

    expect(results[0].page.slug).toBe('strong-match')
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('ranks exact service-area evidence ahead of broad remote coverage', () => {
    const broad = mk({
      slug: 'broad',
      name: 'Broad Co',
      location: 'Remote worldwide',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })
    const local = mk({
      slug: 'local',
      name: 'Local Co',
      location: 'Austin, TX',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })

    const results = searchAgentPages([broad, local], 'strategy', 10, 'https://nexez.test', { location: 'Austin, TX' })
    expect(results.map((result) => result.page.slug)).toEqual(['local', 'broad'])
    expect(results[0].ranking?.location).toBe('exact-or-service-area')
    expect(results[1].ranking?.location).toBe('broad')
  })

  it('prefers explicit availability and never exposes a sold-out checkout action', () => {
    const unspecified = mk({
      slug: 'unspecified',
      name: 'Unspecified Co',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })
    const available = mk({
      slug: 'available',
      name: 'Available Co',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '', availability: 'available' }],
    })
    const soldOut = mk({
      slug: 'sold-out',
      name: 'Sold Out Strategy',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '', availability: 'sold_out' }],
    })

    const results = searchAgentPages([unspecified, soldOut, available], 'strategy')
    expect(results.map((result) => result.page.slug)).toEqual(['available', 'unspecified', 'sold-out'])
    expect(results.find((result) => result.page.slug === 'sold-out')).toMatchObject({
      offer: null,
      ranking: { availability: 'listing-only', actionability: 'listing-only' },
    })
  })

  it('prefers a published transaction path when relevance and availability tie', () => {
    const needsConfirmation = mk({
      slug: 'needs-confirmation',
      name: 'Needs Confirmation',
      services: [{ name: 'Strategy', description: 'Planning.', price: '', url: '', availability: 'available' }],
    })
    const transactionReady = mk({
      slug: 'transaction-ready',
      name: 'Transaction Ready',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '', availability: 'available' }],
    })

    const results = searchAgentPages([needsConfirmation, transactionReady], 'strategy')
    expect(results.map((result) => result.page.slug)).toEqual(['transaction-ready', 'needs-confirmation'])
    expect(results[0].ranking?.actionability).toBe('transaction-ready')
    expect(results[1].ranking?.actionability).toBe('needs-confirmation')
  })

  it('uses server-backed seller verification only after relevance and action evidence tie', () => {
    const unverified = mk({
      slug: 'unverified',
      name: 'A Unverified',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })
    const verified = mk({
      slug: 'verified',
      name: 'Z Verified',
      custom_domain_verified: true,
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })

    const results = searchAgentPages([unverified, verified], 'strategy')
    expect(results.map((result) => result.page.slug)).toEqual(['verified', 'unverified'])
    expect(results[0].ranking?.seller_verified).toBe(true)
  })

  it('treats fewer than three verified purchases neutrally instead of creating a review moat', () => {
    const newComplete = mk({
      slug: 'new-complete',
      name: 'New Complete',
      description: 'Clear scope.',
      audience: 'Operators',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })
    const oneReview = mk({
      slug: 'one-review',
      name: 'One Review',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })

    const results = searchAgentPages([oneReview, newComplete], 'strategy', 10, 'https://nexez.test', {
      reviewSummaries: new Map([['one-review', reviewSummary(1, 5)]]),
    })

    expect(results[0].page.slug).toBe('new-complete')
    expect(results.every((result) => result.ranking?.review_evidence === 'cold-start')).toBe(true)
  })

  it('uses established verified-purchase reputation after the cold-start threshold', () => {
    const established = mk({
      slug: 'established',
      name: 'Established',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })
    const coldStart = mk({
      slug: 'cold-start',
      name: 'Cold Start',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })

    const results = searchAgentPages([coldStart, established], 'strategy', 10, 'https://nexez.test', {
      reviewSummaries: new Map([['established', reviewSummary(5, 4.8)]]),
    })

    expect(results[0].page.slug).toBe('established')
    expect(results[0].ranking).toMatchObject({
      verified_purchase_reviews: 5,
      review_evidence: 'established-positive',
    })
  })

  it('uses freshness only as a deep evidence tie-break', () => {
    const stale = mk({
      slug: 'stale',
      name: 'A Stale',
      updated_at: '2025-01-01T00:00:00.000Z',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })
    const recent = mk({
      slug: 'recent',
      name: 'Z Recent',
      updated_at: '2026-08-20T00:00:00.000Z',
      services: [{ name: 'Strategy', description: 'Planning.', price: '$100', url: '' }],
    })

    const results = searchAgentPages([stale, recent], 'strategy', 10, 'https://nexez.test', {
      now: new Date('2026-08-21T00:00:00.000Z'),
    })
    expect(results.map((result) => result.page.slug)).toEqual(['recent', 'stale'])
    expect(results[0].ranking?.freshness).toBe('recent')
    expect(results[1].ranking?.freshness).toBe('stale')
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

  it('does not recommend substring collisions as competitive query terms', () => {
    const careProvider = mk({
      slug: 'care-provider',
      name: 'Care Provider',
      description: 'Personalized care and rental-property cleaning.',
    })

    const analysis = analyzeQueryRank([careProvider], careProvider, 'car')
    expect(analysis.matched).toBe(false)
    expect(analysis.toWin.join(' ')).toContain('“car”')
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

function reviewSummary(count: number, reputation: number): ReviewSummary {
  return {
    average: reputation,
    count,
    verified_count: count,
    reputation_score: reputation,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': count },
    recent_positive_tags: [],
    recent_reviews: [],
  }
}
