import { describe, expect, it } from 'vitest'
import { assessMarketplacePage, canCertifyMarketplacePage } from '../marketplace-curation'
import {
  MARKETPLACE_SIMULATION_DISCLAIMER,
  MARKETPLACE_SIMULATION_LISTINGS,
} from '../marketplace-simulation-catalog'
import { isPublicLaunchVisiblePage } from '../public-page-visibility'

describe('marketplace simulation catalog', () => {
  it('provides 19 distinct scenarios to complement one real launch listing', () => {
    expect(MARKETPLACE_SIMULATION_LISTINGS).toHaveLength(19)
    expect(new Set(MARKETPLACE_SIMULATION_LISTINGS.map((listing) => listing.slug)).size).toBe(19)
    expect(new Set(MARKETPLACE_SIMULATION_LISTINGS.map((listing) => listing.industry)).size).toBeGreaterThanOrEqual(15)
    expect(new Set(MARKETPLACE_SIMULATION_LISTINGS.map((listing) => listing.simulation.region))).toEqual(new Set([
      'Africa',
      'Asia Pacific',
      'Europe',
      'Latin America',
      'North America',
    ]))
  })

  it('is unmistakably synthetic and cannot leak into discovery or certification', () => {
    for (const listing of MARKETPLACE_SIMULATION_LISTINGS) {
      expect(listing.name).toMatch(/^\[Simulation\]/)
      expect(listing.description).toContain(MARKETPLACE_SIMULATION_DISCLAIMER)
      expect(listing.simulation.enabled).toBe(true)
      expect(listing.is_published).toBe(false)
      expect(listing.marketplace_discoverable).toBe(false)
      expect(listing.mcp_enabled).toBe(false)
      expect(isPublicLaunchVisiblePage(listing)).toBe(false)

      const assessment = assessMarketplacePage(listing)
      expect(assessment.suggestedStatus).toBe('excluded')
      expect(assessment.flags.map((flag) => flag.id)).toContain('internal_fixture')
      expect(canCertifyMarketplacePage(assessment)).toBe(false)
    }
  })

  it('uses only reserved example destinations and includes useful offer coverage', () => {
    for (const listing of MARKETPLACE_SIMULATION_LISTINGS) {
      expect(new URL(listing.website_url || '').hostname).toMatch(/\.example$/)
      expect(new URL(listing.cta_url || '').hostname).toMatch(/\.example$/)
      expect(listing.contact_email).toMatch(/@.+\.example$/)
      expect(listing.services?.length).toBeGreaterThanOrEqual(2)
      expect(listing.services?.every((offer) => offer.name && offer.price && offer.description)).toBe(true)
      expect(listing.services?.every((offer) => new URL(offer.url).hostname.endsWith('.example'))).toBe(true)
      expect(listing.faqs?.length).toBeGreaterThanOrEqual(3)
    }
  })
})
