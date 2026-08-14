import { describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'
import { getAdminGovernanceSnapshot } from './admin-governance'

describe('getAdminGovernanceSnapshot', () => {
  it('joins protected ledgers into a newest-first, redacted operator trail', async () => {
    const db = createSupabaseMock(({ table }) => {
      if (table === 'platform_admins') return { data: [{ user_id: 'admin-1', note: 'Launch lead', created_at: '2026-08-10T00:00:00.000Z' }] }
      if (table === 'seller_growth_campaign_admin_events') return { data: [{ id: 4, action: 'pause', reason: 'Investigating conversion quality', actor_id: 'admin-1', created_at: '2026-08-12T00:00:00.000Z' }] }
      if (table === 'marketplace_curation_events') return { data: [{ id: 5, page_id: 'page-12345678', from_status: 'candidate', to_status: 'certified', reason: 'Quality bar met', actor_id: 'admin-2', created_at: '2026-08-13T00:00:00.000Z' }] }
      if (table === 'release_certifications') return { data: [{ id: 'release-1', status: 'failed', commit_sha: 'abcdef1234567890', launch_score: 92, required_failed_count: 1, triggered_by: 'ci@nexez.ai', completed_at: '2026-08-14T00:00:00.000Z' }] }
      if (table === 'pages_public') return { data: [{ id: 'page-12345678', name: 'Acme Agent' }] }
      return { data: [] }
    }) as ReturnType<typeof createSupabaseMock> & {
      auth: ReturnType<typeof createSupabaseMock>['auth'] & {
        admin: { getUserById: ReturnType<typeof vi.fn> }
      }
    }
    db.auth.admin = {
      getUserById: vi.fn(async (userId: string) => ({
        data: { user: { email: `${userId}@nexez.ai`, user_metadata: { secret: 'not returned' } } },
        error: null,
      })),
    }

    const result = await getAdminGovernanceSnapshot(db as never)

    expect(result.available).toBe(true)
    expect(result.warnings).toEqual([])
    expect(result.operators).toEqual([{
      userId: 'admin-1',
      email: 'admin-1@nexez.ai',
      note: 'Launch lead',
      createdAt: '2026-08-10T00:00:00.000Z',
    }])
    expect(result.events.map((event) => event.id)).toEqual(['release:release-1', 'marketplace:5', 'growth:4'])
    expect(result.events[1]).toMatchObject({
      title: 'Marketplace listing certified',
      detail: 'Acme Agent · candidate → certified · Quality bar met',
      actorEmail: 'admin-2@nexez.ai',
      href: '/admin/launch#marketplace-curation',
    })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('keeps healthy sources visible and exposes partial read failures', async () => {
    const db = createSupabaseMock(({ table }) => {
      if (table === 'platform_admins') return { data: null, error: new Error('membership unavailable') }
      if (table === 'seller_growth_campaign_admin_events') return { data: null, error: new Error('growth unavailable') }
      if (table === 'marketplace_curation_events') return { data: [] }
      if (table === 'release_certifications') return { data: [{ id: 'release-1', status: 'passed', commit_sha: 'abc', launch_score: 100, required_failed_count: 0, triggered_by: null, completed_at: '2026-08-14T00:00:00.000Z' }] }
      return { data: [] }
    }) as ReturnType<typeof createSupabaseMock> & {
      auth: ReturnType<typeof createSupabaseMock>['auth'] & {
        admin: { getUserById: ReturnType<typeof vi.fn> }
      }
    }
    db.auth.admin = { getUserById: vi.fn() }

    const result = await getAdminGovernanceSnapshot(db as never)

    expect(result.available).toBe(false)
    expect(result.warnings).toEqual([
      'Platform-admin membership is unavailable.',
      'Growth operator history is unavailable.',
    ])
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ id: 'release:release-1', tone: 'ready' })
  })
})
