import { describe, expect, it } from 'vitest'
import { buildNotifications } from '../notifications'
import type { AgentPage } from '../agent-page'

const page = (over: Partial<AgentPage>): AgentPage =>
  ({ id: 'p', name: 'P', slug: 'p', is_published: true, services: [], products: [], faqs: [], ...over }) as AgentPage

const old = new Date(Date.now() - 200 * 86400000).toISOString()

describe('buildNotifications', () => {
  it('surfaces a complete cross-rail action queue and deep-links one native record', () => {
    const n = buildNotifications({
      pages: [],
      commerceAttention: {
        visibleCount: 1,
        urgentCount: 0,
        isTruncated: false,
        status: 'complete',
        href: '/dashboard/orders/order-1',
      },
    })
    expect(n.find((x) => x.id === 'commerce-attention')).toMatchObject({
      message: '1 commerce record needs your attention',
      cta: 'Review action',
      href: '/dashboard/orders/order-1',
    })
  })
  it('keeps incomplete action coverage visible instead of presenting an all-clear', () => {
    const partial = buildNotifications({
      pages: [],
      commerceAttention: {
        visibleCount: 2,
        urgentCount: 1,
        isTruncated: false,
        status: 'partial',
        href: '/dashboard/commerce',
      },
    })
    const unavailable = buildNotifications({
      pages: [],
      commerceAttention: {
        visibleCount: 0,
        urgentCount: 0,
        isTruncated: false,
        status: 'unavailable',
        href: '/dashboard/commerce',
      },
    })
    const boundedUnknown = buildNotifications({
      pages: [],
      commerceAttention: {
        visibleCount: 0,
        urgentCount: 0,
        isTruncated: true,
        status: 'partial',
        href: '/dashboard/commerce',
      },
    })

    expect(partial[0]?.message).toBe('2+ commerce records need your attention, 1 urgent')
    expect(unavailable[0]?.message).toContain('could not be checked')
    expect(boundedUnknown[0]?.message).toContain('coverage is incomplete')
  })
  it('flags stale published pages with a website', () => {
    const n = buildNotifications({
      pages: [page({ id: 'x', website_url: 'https://a.com', updated_at: old })],
      commerceAttention: null,
    })
    expect(n.find((x) => x.id === 'stale')).toBeTruthy()
  })
  it('flags draft pages that have offers', () => {
    const n = buildNotifications({
      pages: [page({ is_published: false, services: [{ name: 's' }] as never })],
      commerceAttention: null,
    })
    expect(n.find((x) => x.id === 'unpublished')).toBeTruthy()
  })
  it('returns nothing when all clear', () => {
    expect(buildNotifications({
      pages: [page({})],
      commerceAttention: {
        visibleCount: 0,
        urgentCount: 0,
        isTruncated: false,
        status: 'complete',
        href: '/dashboard/commerce',
      },
    })).toEqual([])
  })
})
