import { describe, expect, it } from 'vitest'
import { billingPlans } from '../billing'
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

  it('advertises the live Free-through-Scale price range', () => {
    const graph = buildPlatformStructuredData()
    const software = graph['@graph'].find(
      (node) => node['@type'] === 'SoftwareApplication',
    ) as Record<string, unknown>
    const offers = software.offers as Record<string, unknown>
    const selectablePrices = billingPlans
      .filter((plan) => plan.id !== 'enterprise')
      .map((plan) => Number(plan.price.replace(/[^0-9.]/g, '')))

    expect(offers['@type']).toBe('AggregateOffer')
    expect(offers.lowPrice).toBe(Math.min(...selectablePrices))
    expect(offers.highPrice).toBe(Math.max(...selectablePrices))
    expect(offers.lowPrice).toBe(0)
    expect(offers.priceCurrency).toBe('USD')
    expect(offers.offerCount).toBe(selectablePrices.length)
    expect(JSON.stringify(graph)).toContain('Free and paid plans')
  })

  it('keeps structured search on the agent API while human discovery is hidden', () => {
    const site = buildPlatformStructuredData()['@graph'].find(
      (node) => node['@type'] === 'WebSite',
    ) as Record<string, any>
    expect(site).toBeTruthy()
    expect(site.potentialAction['@type']).toBe('SearchAction')
    expect(site.potentialAction.target.urlTemplate).toContain('/api/agent-search?q={search_term_string}')
    expect(site.publisher['@id']).toContain('#organization')
  })

  it('emits a stable content date, not the render timestamp', () => {
    const pick = () =>
      buildPlatformStructuredData()['@graph'].find(
        (node) => node['@type'] === 'SoftwareApplication',
      ) as Record<string, unknown>
    const software = pick()
    expect(software.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(pick().dateModified).toBe(software.dateModified)
  })
})
