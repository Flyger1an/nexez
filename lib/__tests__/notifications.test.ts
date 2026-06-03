import { describe, expect, it } from 'vitest'
import { buildNotifications } from '../notifications'
import type { AgentPage } from '../agent-page'

const page = (over: Partial<AgentPage>): AgentPage =>
  ({ id: 'p', name: 'P', slug: 'p', is_published: true, services: [], products: [], faqs: [], ...over }) as AgentPage

const old = new Date(Date.now() - 200 * 86400000).toISOString()

describe('buildNotifications', () => {
  it('surfaces open negotiations as an action', () => {
    const n = buildNotifications({ pages: [], openNegotiations: 3 })
    expect(n.find((x) => x.id === 'negotiations')?.message).toContain('3 negotiations')
  })
  it('flags stale published pages with a website', () => {
    const n = buildNotifications({
      pages: [page({ id: 'x', website_url: 'https://a.com', updated_at: old })],
      openNegotiations: 0,
    })
    expect(n.find((x) => x.id === 'stale')).toBeTruthy()
  })
  it('flags draft pages that have offers', () => {
    const n = buildNotifications({
      pages: [page({ is_published: false, services: [{ name: 's' }] as never })],
      openNegotiations: 0,
    })
    expect(n.find((x) => x.id === 'unpublished')).toBeTruthy()
  })
  it('returns nothing when all clear', () => {
    expect(buildNotifications({ pages: [page({})], openNegotiations: 0 })).toEqual([])
  })
})
