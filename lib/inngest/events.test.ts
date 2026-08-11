import { describe, expect, it } from 'vitest'
import { FEED_REGENERATE, FRESHNESS_NUDGE, OUTBOUND_WEBHOOKS_DISPATCH, buildFreshnessNudgeData } from './events'

const basePage = {
  id: 'page-123',
  owner_id: 'owner-abc',
  contact_email: 'owner@example.com',
  slug: 'acme-plumbing',
  name: 'Acme Plumbing',
  updated_at: null,
  created_at: null,
}

describe('event names', () => {
  it('are stable, namespaced identifiers', () => {
    expect(OUTBOUND_WEBHOOKS_DISPATCH).toBe('nexez/outbound-webhooks.dispatch')
    expect(FRESHNESS_NUDGE).toBe('nexez/freshness.nudge')
    expect(FEED_REGENERATE).toBe('nexez/feed.regenerate')
  })
})

describe('buildFreshnessNudgeData', () => {
  it('returns null for ownerless pages (nobody to nudge)', () => {
    expect(buildFreshnessNudgeData({ ...basePage, owner_id: null }, 0)).toBeNull()
  })

  it('projects the page into a complete nudge payload', () => {
    const data = buildFreshnessNudgeData(basePage, 2)
    expect(data).not.toBeNull()
    expect(data?.pageId).toBe('page-123')
    expect(data?.ownerId).toBe('owner-abc')
    expect(data?.contactEmail).toBe('owner@example.com')
    expect(data?.businessName).toBe('Acme Plumbing')
    expect(data?.listingName).toBe('Acme Plumbing')
    expect(data?.priorNudgeCount).toBe(2)
    expect(data?.reinterviewUrl).toContain('/create?reinterview=page-123')
    expect(data?.editUrl).toContain('/dashboard/page-123')
  })

  it('falls back to the slug when the page has no name', () => {
    const data = buildFreshnessNudgeData({ ...basePage, name: null }, 0)
    expect(data?.businessName).toBe('acme-plumbing')
    expect(data?.listingName).toBe('acme-plumbing')
  })

  it('carries a freshness label derived from the page timestamps', () => {
    const noTimestamps = buildFreshnessNudgeData(basePage, 0)
    expect(noTimestamps?.freshnessLabel).toBe('Unknown')

    const fourMonthsAgo = new Date(Date.now() - 120 * 86400000).toISOString()
    const stale = buildFreshnessNudgeData({ ...basePage, updated_at: fourMonthsAgo }, 0)
    expect(stale?.freshnessLabel).toBe('Updated 4 months ago')
  })
})
