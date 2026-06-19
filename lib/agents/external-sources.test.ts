import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { yelpAdapter, googlePlacesAdapter } from './external-sources'
import type { SourceAdapterContext } from './source-adapters'

const ctx = (location?: string): SourceAdapterContext => ({ db: {} as never, baseUrl: 'https://nexez.app', location })

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  delete process.env.YELP_API_KEY
  delete process.env.GOOGLE_PLACES_API_KEY
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.YELP_API_KEY
  delete process.env.GOOGLE_PLACES_API_KEY
})

describe('yelpAdapter', () => {
  it('is unavailable + returns nothing without an API key', async () => {
    expect(yelpAdapter.available?.()).toBe(false)
    expect(await yelpAdapter.search('plumber', 5, ctx('Austin'))).toEqual([])
  })

  it('returns nothing without a location (Yelp requires one) even with a key', async () => {
    process.env.YELP_API_KEY = 'k'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await yelpAdapter.search('plumber', 5, ctx())).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled() // never even calls Yelp
  })

  it('maps businesses to discovery-only results (no offer, source-stamped)', async () => {
    process.env.YELP_API_KEY = 'k'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          businesses: [
            { id: 'biz1', name: 'Axle Plumbing', url: 'https://yelp.com/biz/biz1', rating: 4.5, review_count: 88, price: '$$', categories: [{ title: 'Plumbing' }], location: { display_address: ['1 Main St', 'Austin, TX'] } },
          ],
        }),
      ),
    )
    const out = await yelpAdapter.search('plumber', 5, ctx('Austin'))
    expect(out).toHaveLength(1)
    expect(out[0].offer).toBeNull() // discovery-only — never bookable
    expect(out[0].source).toEqual({ id: 'yelp', label: 'Yelp' })
    expect(out[0].page.slug).toBe('yelp:biz1')
    expect(out[0].page.name).toBe('Axle Plumbing')
    expect(out[0].page.url).toBe('https://yelp.com/biz/biz1')
    expect(out[0].page.location).toContain('Austin')
    expect(out[0].score).toBeGreaterThan(0)
  })

  it('throws on a non-200 (so the fan-out isolates it)', async () => {
    process.env.YELP_API_KEY = 'k'
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 429)))
    await expect(yelpAdapter.search('plumber', 5, ctx('Austin'))).rejects.toThrow(/Yelp/)
  })
})

describe('googlePlacesAdapter', () => {
  it('is unavailable + returns nothing without an API key', async () => {
    expect(googlePlacesAdapter.available?.()).toBe(false)
    expect(await googlePlacesAdapter.search('coffee', 5, ctx())).toEqual([])
  })

  it('maps places to discovery-only results and works without a location', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          places: [
            { id: 'p1', displayName: { text: 'Blue Bottle' }, formattedAddress: '2 Market St', websiteUri: 'https://bluebottle.com', rating: 4.7, userRatingCount: 1200, primaryTypeDisplayName: { text: 'Coffee shop' } },
          ],
        }),
      ),
    )
    const out = await googlePlacesAdapter.search('coffee', 5, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].offer).toBeNull()
    expect(out[0].source).toEqual({ id: 'google_places', label: 'Google' })
    expect(out[0].page.slug).toBe('google:p1')
    expect(out[0].page.name).toBe('Blue Bottle')
    expect(out[0].page.url).toBe('https://bluebottle.com')
  })

  it('throws on a non-200', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)))
    await expect(googlePlacesAdapter.search('coffee', 5, ctx())).rejects.toThrow(/Google Places/)
  })
})
