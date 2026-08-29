import { describe, it, expect } from 'vitest'
import { buildUrlSimComparison } from '../url-simulation'
import type { ImportResult } from '../importer'

function mkResult(over: Partial<ImportResult>): ImportResult {
  return {
    title: 'Acme',
    description: 'We do things',
    website_url: 'https://acme.com',
    structuredOffers: [],
    suggestedOffers: [],
    servicesText: '',
    pagesAnalyzed: 3,
    agentDocumentsAnalyzed: 0,
    confidence: 0.5,
    aiStatus: { configured: false } as any,
    ...over,
  } as ImportResult
}

describe('buildUrlSimComparison', () => {
  it('derives host and counts offers + prices from the crawl', () => {
    const c = buildUrlSimComparison(
      'https://www.acme.com/pricing',
      mkResult({
        structuredOffers: [
          { name: 'Tune-up', price: '$99', description: 'x', url: '' },
          { name: 'Install', price: '', description: '', url: '' },
        ] as any,
        faqs: [{ question: 'q', answer: 'a' }],
        readiness: { score: 70, strengths: [], gaps: [] },
      }),
    )
    expect(c.host).toBe('acme.com')
    expect(c.agentReady.offerCount).toBe(2)
    expect(c.agentReady.pricedCount).toBe(1)
    expect(c.agentReady.faqCount).toBe(1)
    // Readiness is recomputed honestly from the real extraction (offers + faqs +
    // description present; no audience/cta/etc.), not passed through from the importer.
    expect(c.agentReady.readiness).toBeGreaterThan(50)
    expect(c.agentReady.readiness).toBeLessThanOrEqual(100)
  })

  it('says the raw site is unstructured when it exposes no native agent data', () => {
    const c = buildUrlSimComparison('https://acme.com', mkResult({ sources: [{ type: 'heuristic', url: '', label: '', method: '' }] }))
    expect(c.raw.nativeStructuredData).toBe(false)
    expect(c.raw.nativeAgentDocs).toBe(false)
    expect(c.raw.summary).toMatch(/unstructured HTML/i)
    expect(c.raw.actionable).toBe(false)
  })

  it('credits native schema.org / agent docs when present', () => {
    const schema = buildUrlSimComparison('https://acme.com', mkResult({ sources: [{ type: 'schema_org', url: '', label: '', method: '' }] }))
    expect(schema.raw.nativeStructuredData).toBe(true)
    expect(schema.raw.summary).toMatch(/schema\.org/i)

    const docs = buildUrlSimComparison('https://acme.com', mkResult({ sources: [{ type: 'llms_txt', url: '', label: '', method: '' }] }))
    expect(docs.raw.nativeAgentDocs).toBe(true)
  })

  it('always lists a callable checkout among the gains, and a verdict referencing the host', () => {
    const c = buildUrlSimComparison('https://acme.com', mkResult({ structuredOffers: [{ name: 'X', price: '$1', description: '', url: '' }] as any }))
    expect(c.gains.join(' ')).toMatch(/checkout/i)
    expect(c.verdict).toMatch(/acme\.com/)
  })

  it('handles a crawl that found no offers without crashing', () => {
    const c = buildUrlSimComparison('https://acme.com', mkResult({ structuredOffers: [] }))
    expect(c.agentReady.offerCount).toBe(0)
    expect(c.verdict).toMatch(/couldn't auto-detect/i)
  })

  it('does NOT present template/scaffold offers as detected (honesty)', () => {
    // A thin site where the importer only scaffolded a template fallback.
    const c = buildUrlSimComparison(
      'https://placeholder.example',
      mkResult({
        structuredOffers: [
          { name: 'Discovery Session', price: '$150', description: '', url: '', source: 'template' },
          { name: 'Core Engagement', price: 'From $1,800', description: '', url: '', source: 'template' },
        ] as any,
        faqs: [{ question: 'q', answer: 'a' }],
        readiness: { score: 73, strengths: [], gaps: [] },
      }),
    )
    expect(c.agentReady.offerCount).toBe(0)
    expect(c.agentReady.faqCount).toBe(0) // faqs not credited when nothing real was extracted
    expect(c.verdict).toMatch(/couldn't auto-detect/i)
    // The projected readiness must not inherit the scaffold's inflated 73%.
    expect(c.agentReady.readiness).toBeLessThan(73)
  })

  it('keeps genuinely-extracted offers (schema.org / heuristic)', () => {
    const c = buildUrlSimComparison(
      'https://real.example',
      mkResult({
        structuredOffers: [
          { name: 'Deep clean', price: '$120', description: 'x', url: '', source: 'schema_org' },
          { name: 'Scaffold', price: '$1', description: '', url: '', source: 'template' },
        ] as any,
      }),
    )
    expect(c.agentReady.offerCount).toBe(1)
    expect(c.agentReady.offers[0].name).toBe('Deep clean')
  })
})
