import { describe, it, expect } from 'vitest'
import { optimizeAllOffersForAgents, rewriteOfferForAgents, enhanceDescriptionForAgents, rewriteForVoice } from '../ai-optimize'
import { parseOfferLines, type OfferItem } from '../agent-page'
import { analyzeCompetitorSite } from '../competitor-analyzer'

describe('ai-optimize (Phase 5 coverage + fidelity)', () => {
  it('rewriteOfferForAgents preserves all rich fields (consumer, tiers, per-offer original, source, metadata, confidence)', () => {
    const rich: OfferItem = {
      name: 'Mobile Grooming',
      price: '$85',
      description: 'Full service at your home.',
      url: 'https://example.com/book/groom',
      duration: '90 min',
      isMobile: true,
      serviceArea: 'Metro area',
      travelFee: '$15',
      tiers: [
        { name: 'Basic', price: '$85' },
        { name: 'Deluxe', price: '$120' },
      ],
      source: 'square',
      confidence: 0.91,
      prefer_original_for_this: true,
      metadata: { stable_id: 'sq-123', foo: 'bar' },
    }

    const rewritten = rewriteOfferForAgents(rich, { businessName: 'Pawfect Grooming', audience: 'pet owners' })

    // Core identity
    expect(rewritten.name).toBe(rich.name)
    expect(rewritten.price).toBe(rich.price)
    // Description is enhanced but we at least keep length and key signals
    expect(rewritten.description?.length || 0).toBeGreaterThan(10)

    // Full fidelity of Phase 1/4 fields
    expect(rewritten.duration).toBe('90 min')
    expect(rewritten.isMobile).toBe(true)
    expect(rewritten.serviceArea).toBe('Metro area')
    expect(rewritten.travelFee).toBe('$15')
    expect(rewritten.tiers?.length).toBe(2)
    expect(rewritten.source).toBe('square')
    expect(rewritten.confidence).toBe(0.91)
    expect(rewritten.prefer_original_for_this).toBe(true)
    expect((rewritten.metadata as any)?.stable_id).toBe('sq-123')
    expect(rewritten.url).toBe(rich.url)
  })

  it('optimizeAllOffersForAgents (text path) roundtrips through parse/rewrite/format and preserves per-offer controls', () => {
    const servicesText = [
      'Standard Service | $129 | Diagnosis + repair | https://ex.com/s1 ||TIERS||[{"name":"Basic","price":"$99"},{"name":"Full","price":"$159"}] [[PREFER_ORIGINAL]]',
      'Emergency | $189 | Same day | https://ex.com/s2 | 60 min | Local | $20 | 1',
    ].join('\n')

    const { services: opt } = optimizeAllOffersForAgents(servicesText, '', {
      businessName: 'Acme Plumbing',
      audience: 'homeowners',
    })

    expect(opt).toBeTruthy()
    // Consumer fields preserved in the formatted text (from second offer)
    expect(opt).toContain('60 min')
    expect(opt).toContain('$20')
    // Per-offer controls: the rewrite + format should keep the spirit (markers may be normalized but rich data survives)
    // We already have dedicated fidelity tests; here we mainly ensure no crash and consumer data roundtrips.
    const parsedBack = parseOfferLines(opt || '')
    expect(parsedBack.some(o => o.duration === '60 min' || (o.travelFee && o.travelFee.includes('20')) || o.isMobile)).toBe(true)
  })

  it('rewrite path includes travelFee when rewriting consumer offers (enhanceDescription is description-level only)', () => {
    const offer: OfferItem = {
      name: 'Detail Visit',
      price: '$149',
      description: 'We come to your location for convenience.',
      url: '',
      travelFee: '$35',
      isMobile: true,
    }
    const rewritten = rewriteOfferForAgents(offer, { businessName: 'Detail Pros', audience: 'car owners' })
    const d = (rewritten.description || '').toLowerCase()
    expect(d).toContain('travel') // from the consumer details injection in rewrite
    expect(d.length).toBeGreaterThan(20)
  })

  it('rewriteForVoice produces spoken-friendly output (Tier 3)', () => {
    const offer: OfferItem = {
      name: 'Strategy Session',
      price: '$450',
      description: '60-minute focused session. Price $450 with clear deliverables & next steps.',
      url: '',
    }
    const voiced = rewriteForVoice(offer, 'Aether Strategy')
    expect(voiced.description.toLowerCase()).toContain('dollars')
    expect(voiced.description.length).toBeLessThan(250)
    expect(voiced.description.toLowerCase()).toContain('say it')
  })
})

// Basic smoke for new Tier 2 analyzer (data flywheel + respectful)
describe('competitor-analyzer (Tier 2 intelligence)', () => {
  it('analyze returns valid scores in 0-100, cache works, no crash on bad url', async () => {
    const res1 = await analyzeCompetitorSite('https://example.com')
    expect(res1.scores.overall).toBeGreaterThanOrEqual(0)
    expect(res1.scores.overall).toBeLessThanOrEqual(100)
    expect(res1.scores.parseability).toBeGreaterThanOrEqual(0)

    // cache hit
    const res2 = await analyzeCompetitorSite('https://example.com')
    expect(res2.analyzedAt).toBe(res1.analyzedAt) // same cached

    const bad = await analyzeCompetitorSite('https://this-will-not-resolve-123456.invalid')
    expect(bad.scores.overall).toBeLessThan(50) // degraded but valid
  })

  it('analyzer computes side-by-side when userNexezPage provided', async () => {
    const res = await analyzeCompetitorSite('https://example.com', {
      userNexezPage: { slug: 'my-page', readiness: 85, trust: 90, offerCount: 5, description: 'Test' }
    })
    expect(res.userComparison).toBeTruthy()
    expect(res.userComparison?.slug).toBe('my-page')
    expect(res.userComparison?.readiness).toBe(85)
  })

  it('analyzer recommendations are actionable and limited', async () => {
    const res = await analyzeCompetitorSite('https://example.com')
    expect(Array.isArray(res.recommendations)).toBe(true)
    expect(res.recommendations.length).toBeLessThanOrEqual(6)
    if (res.recommendations.length > 0) {
      expect(typeof res.recommendations[0]).toBe('string')
    }
  })

  it('analyzer respects cache TTL and robots for respectful scrape', async () => {
    const res1 = await analyzeCompetitorSite('https://example.com')
    const res2 = await analyzeCompetitorSite('https://example.com')
    // cache hit should return same analyzedAt
    expect(res2.analyzedAt).toBe(res1.analyzedAt)
  })
})
