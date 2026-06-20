import { describe, it, expect, vi, beforeEach } from 'vitest'

const refs = vi.hoisted(() => ({ resolved: null as any }))

vi.mock('../../../../lib/server/storefront', () => ({
  loadStorefrontByHandle: vi.fn(async () => refs.resolved),
}))
vi.mock('../../../../lib/agent-page', async (orig) => {
  const actual = (await orig()) as any
  return {
    ...actual,
    getBaseUrl: () => 'https://nexez.app',
    getOfferCount: () => 2,
    getReadinessScore: () => 85,
    getCertification: () => ({ certified: true }),
  }
})

import { GET } from './route'

const req = () => new Request('https://nexez.app/store/acme/agent.json')
const params = (handle: string) => ({ params: Promise.resolve({ handle }) })

describe('GET /store/[handle]/agent.json', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.resolved = {
      storefront: { id: 's1', owner_id: 'o1', handle: 'acme', display_name: 'Acme Co', description: 'We sell things', logo_url: null, accent_color: null },
      listings: [{ id: 'p1', name: 'Deep Clean', slug: 'acme-deep-clean', description: 'A clean', location: 'NYC' }],
    }
  })

  it('404s an unknown handle', async () => {
    refs.resolved = null
    expect((await GET(req(), params('nope'))).status).toBe(404)
  })

  it('emits a storefront manifest with brand + per-listing agent_json URLs', async () => {
    const res = await GET(req(), params('acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schema_version).toBe('nexez.storefront.v1')
    expect(body.storefront).toMatchObject({
      handle: 'acme', name: 'Acme Co', url: 'https://nexez.app/store/acme',
      listings_count: 1, total_offers: 2, avg_readiness: 85, certified_listings: 1,
    })
    expect(body.listings[0]).toMatchObject({
      name: 'Deep Clean',
      slug: 'acme-deep-clean',
      url: 'https://nexez.app/acme-deep-clean',
      agent_json_url: 'https://nexez.app/acme-deep-clean/agent.json',
      offer_count: 2,
      readiness: 85,
      certified: true,
    })
  })
})
