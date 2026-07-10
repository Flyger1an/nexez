import { describe, expect, it } from 'vitest'
import { buildPlatformAgentManifest, buildPlatformStructuredData } from '../platform-agent-manifest'
import { extractStructuredEvidence } from '../server/site-scan'

describe('Nexez first-party agent evidence', () => {
  it('publishes a meaningful root discovery manifest', () => {
    const manifest = buildPlatformAgentManifest()
    expect(manifest.name).toBe('Nexez')
    expect(manifest.capabilities.offer_discovery).toBe(true)
    expect(manifest.offers[0].price).toBe(0)
    expect(manifest.offers[0].action.url).toMatch(/^https?:\/\//)
    expect(manifest.endpoints.openapi).toContain('/openapi.json')
  })

  it('earns structured identity, offer, price, action, availability, and trust evidence', () => {
    const graph = buildPlatformStructuredData()
    const html = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`
    const evidence = extractStructuredEvidence(html)
    expect(evidence.hasBusinessIdentity).toBe(true)
    expect(evidence.hasOfferSchema).toBe(true)
    expect(evidence.hasStructuredPrice).toBe(true)
    expect(evidence.hasStructuredAction).toBe(true)
    expect(evidence.hasStructuredAvailability).toBe(true)
    expect(evidence.hasOfferDetails).toBe(true)
    expect(evidence.hasStructuredContact).toBe(true)
    expect(evidence.hasStructuredPolicies).toBe(true)
    expect(evidence.dates.length).toBeGreaterThan(0)
  })
})
