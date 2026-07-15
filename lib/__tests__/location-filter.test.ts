import { describe, expect, it } from 'vitest'
import {
  cleanLocationQuery,
  filterPagesByLocation,
  getPageLocationMatch,
  locationTokens,
  normalizeLocationText,
  pageLocationValues,
} from '../location-filter'
import type { AgentPage } from '../agent-page'

function page(overrides: Partial<AgentPage>): AgentPage {
  return {
    id: overrides.slug || 'p',
    name: overrides.name || 'Test Page',
    slug: overrides.slug || 'test-page',
    description: null,
    website_url: null,
    cta_url: null,
    cta_label: null,
    audience: null,
    location: null,
    contact_email: null,
    products: [],
    services: [],
    faqs: [],
    is_published: true,
    ...overrides,
  } as AgentPage
}

describe('location filtering', () => {
  it('cleans and normalizes location queries with aliases', () => {
    expect(cleanLocationQuery('  Austin,   TX  ')).toBe('Austin, TX')
    expect(normalizeLocationText('NYC')).toContain('new york')
    expect(locationTokens('Los Angeles, CA')).toEqual(expect.arrayContaining(['los', 'angeles', 'california']))
  })

  it('collects page location and offer service areas', () => {
    const values = pageLocationValues(
      page({
        location: 'Remote',
        services: [{ name: 'Install', description: '', price: '', url: '', serviceArea: 'Chicago, IL' }],
      }),
    )

    expect(values).toEqual(expect.arrayContaining(['Remote', 'Chicago, IL']))
  })

  it('matches city and state aliases', () => {
    const match = getPageLocationMatch(page({ location: 'Austin, Texas' }), 'Austin, TX')
    expect(match.matched).toBe(true)
    expect(match.mode).toBe('text')
    expect(match.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('keeps broad remote or nationwide listings eligible', () => {
    const match = getPageLocationMatch(page({ location: 'Remote - nationwide' }), 'Boston, MA')
    expect(match.matched).toBe(true)
    expect(match.mode).toBe('broad')
  })

  it('does not treat the "us" inside Austin as a broad location term', () => {
    const match = getPageLocationMatch(page({ location: 'Austin, Texas' }), 'DFW Metroplex')
    expect(match.matched).toBe(false)
    expect(match.mode).toBe('none')
  })

  it('still treats a standalone US service area as broad', () => {
    const match = getPageLocationMatch(page({ location: 'US nationwide' }), 'DFW Metroplex')
    expect(match.matched).toBe(true)
    expect(match.mode).toBe('broad')
  })

  it('filters pages by page location and offer service area', () => {
    const chicago = page({ slug: 'chi', location: 'Chicago, IL' })
    const serviceArea = page({ slug: 'svc', services: [{ name: 'Home visit', description: '', price: '', url: '', serviceArea: 'Chicago metro' }] })
    const nyc = page({ slug: 'nyc', location: 'New York, NY' })

    expect(filterPagesByLocation([chicago, serviceArea, nyc], 'Chicago').map((p) => p.slug)).toEqual(['chi', 'svc'])
  })
})
