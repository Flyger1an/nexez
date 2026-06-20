import { describe, expect, it } from 'vitest'
import { buildAgentPagePayload, buildAgentStorefrontRef, getAgentJsonPath } from '../agent-manifest'
import { rewriteForVoiceSync } from '../ai-optimize'
import type { AgentPage } from '../agent-page'

const page = {
  id: 'p', name: 'Acme', slug: 'acme', description: 'desc', is_published: true,
  website_url: 'https://acme.com', updated_at: '2026-06-01T00:00:00Z',
  services: [{ name: 'Consult', description: 'A consult', price: '$100', url: '', availability: 'limited' }],
  products: [], faqs: [{ question: 'q', answer: 'a' }],
} as unknown as AgentPage

describe('buildAgentPagePayload', () => {
  const payload = buildAgentPagePayload(page) as any

  it('emits schema version, last_updated, and page identity', () => {
    expect(payload.schema_version).toBe('nexez.agent-page.v1')
    expect(payload.last_updated).toBe('2026-06-01T00:00:00Z')
    expect(payload.page.name).toBe('Acme')
    expect(payload.page.slug).toBe('acme')
  })

  it('keeps canonical manifest URLs protocol-safe', () => {
    const urlPayload = buildAgentPagePayload(page, 'https://nexez.app') as any
    expect(urlPayload.page.url).toBe('https://nexez.app/acme')
    expect(urlPayload.page.agent_json_url).toBe('https://nexez.app/acme/agent.json')
    expect(urlPayload.page.llms_url).toBe('https://nexez.app/acme/llms.txt')
    expect(urlPayload.offers[0].checkout_url).toMatch(/^https:\/\/.+\/checkout\/acme\?offer=services-0$/)
    expect(urlPayload.plain_text).toContain('URL: https://nexez.app/acme')
    expect(urlPayload.plain_text).toContain('Agent JSON: https://nexez.app/acme/agent.json')
  })

  it('surfaces a resolved preferred-contact block (derived) on the page', () => {
    // fixture has only website_url → derived channel is website
    expect(payload.page.contact).toEqual({ preferred: 'website', value: 'https://acme.com', channels: ['website'] })
    // a stored preference that is configured wins and leads the channel list
    const pref = buildAgentPagePayload({ ...page, contact_email: 'hi@acme.com', preferred_contact: 'email' } as unknown as AgentPage) as any
    expect(pref.page.contact.preferred).toBe('email')
    expect(pref.page.contact.value).toBe('hi@acme.com')
  })

  it('includes offers with availability + checkout action', () => {
    expect(payload.offers.length).toBe(1)
    expect(payload.offers[0].availability).toBe('limited')
    expect(payload.offers[0].action.endpoint).toContain('/api/checkout')
  })

  it('surfaces the settlement currency on the page block and each offer', () => {
    // no currency on the page → defaults to usd (so an agent never assumes blindly)
    expect(payload.page.currency).toBe('usd')
    expect(payload.offers[0].currency).toBe('usd')
    // a non-USD page propagates to the page block + every offer
    const gbp = buildAgentPagePayload({ ...page, currency: 'gbp' } as unknown as AgentPage) as any
    expect(gbp.page.currency).toBe('gbp')
    expect(gbp.offers[0].currency).toBe('gbp')
  })

  it('includes a plain_text block for LLMs', () => {
    expect(typeof payload.plain_text).toBe('string')
    expect(payload.plain_text).toContain('Acme')
  })

  it('can include an additive storefront reference', () => {
    const storefront = buildAgentStorefrontRef('acme-store', 'https://nexez.app')
    const storefrontPayload = buildAgentPagePayload(page, 'https://nexez.app', { storefront }) as any
    expect(storefrontPayload.storefront).toEqual({
      handle: 'acme-store',
      url: 'https://nexez.app/store/acme-store',
      agent_json_url: 'https://nexez.app/store/acme-store/agent.json',
    })
    expect(storefrontPayload.plain_text).toContain('Storefront: https://nexez.app/store/acme-store')
  })

  it('can include verified purchase rating summaries', () => {
    const ratedPayload = buildAgentPagePayload(page, 'https://nexez.app', {
      reviewSummary: {
        average: 4.8,
        count: 12,
        verified_count: 12,
        reputation_score: 4.62,
        distribution: { '1': 0, '2': 0, '3': 1, '4': 2, '5': 9 },
        recent_positive_tags: [{ label: 'Fast response', count: 6 }],
        recent_reviews: [{ id: 'r1', rating: 5, title: 'Great', body: 'Clear.', tags: [], createdAt: '2026-06-20T00:00:00Z' }],
      },
    }) as any

    expect(ratedPayload.page.rating_summary).toMatchObject({
      average: 4.8,
      count: 12,
      reputation_score: 4.62,
    })
    expect(ratedPayload.plain_text).toContain('Verified rating: 4.8/5 from 12 purchase reviews')
  })
})

describe('getAgentJsonPath', () => {
  it('builds the per-slug agent.json path', () => {
    expect(getAgentJsonPath('acme')).toBe('/acme/agent.json')
  })
})

describe('Smart Rules in the agent manifest (privacy invariant)', () => {
  const rulesPage = {
    ...page,
    services: [
      {
        name: 'Custom Build',
        description: 'Scoped work',
        price: 'From $2,000',
        url: '',
        offerType: 'negotiable',
        rules: {
          minPrice: '$1,500',
          maxDiscountPercent: 20,
          autoAccept: true,
          autoAcceptWithinPercent: 10,
          minNoticeHours: 48,
          blackoutDates: ['2026-12-25'],
          maxBookingsPerWeek: 3,
        },
      },
    ],
  } as unknown as AgentPage
  // negotiation_action is gated: it appears only when the owner's plan allows
  // negotiation (threaded in by the route). Build with it enabled here.
  const payload = buildAgentPagePayload(rulesPage, undefined, { negotiationAllowed: true }) as any
  const offer = payload.offers[0]

  it('exposes offer_type + public booking constraints', () => {
    expect(offer.offer_type).toBe('negotiable')
    expect(offer.accepts_negotiation).toBe(true)
    expect(offer.min_notice_hours).toBe(48)
    expect(offer.blackout_dates).toEqual(['2026-12-25'])
    expect(offer.max_bookings_per_week).toBe(3)
    expect(offer.negotiation_action.status_check.endpoint).toContain('/api/negotiations/status')
  })

  it('OMITS negotiation_action when the plan does not allow negotiation (default)', () => {
    const gated = buildAgentPagePayload(rulesPage) as any
    expect(gated.offers[0].offer_type).toBe('negotiable') // booking constraints still public
    expect(gated.offers[0].negotiation_action).toBeUndefined() // but no live negotiation endpoint
  })

  it('NEVER serializes private pricing rules (minPrice / discount / auto-accept)', () => {
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toMatch(/minPrice|min_price|1,?500|maxDiscount|autoAccept|auto_accept/i)
    expect(serialized).not.toContain('"rules"')
  })

  it('fixed offers without rules read as fixed with no constraints', () => {
    const fixedPayload = buildAgentPagePayload(page) as any
    expect(fixedPayload.offers[0].offer_type).toBe('fixed')
    expect(fixedPayload.offers[0].accepts_negotiation).toBe(false)
    expect(fixedPayload.offers[0].min_notice_hours).toBeUndefined()
  })
})
