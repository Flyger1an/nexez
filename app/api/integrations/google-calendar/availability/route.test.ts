import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ admin: true })) }))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))
vi.mock('../../../../../lib/server/page-access', () => ({
  resolveFeatureOwner: vi.fn(async ({ userId, pageId }: { userId: string; pageId?: string }) => ({
    ok: true,
    ownerId: pageId ? 'page-owner-1' : userId,
    pageId: pageId ?? null,
    scoped: Boolean(pageId),
    role: pageId ? 'editor' : 'owner',
  })),
}))

import { GET, POST } from './route'
import { createClient } from '../../../../../utils/supabase/server'
import { ownerAllows } from '../../../../../lib/server/plan'
import { resolveFeatureOwner } from '../../../../../lib/server/page-access'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/integrations/google-calendar/availability', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

function authed(user: { id: string } | null = { id: 'owner-1' }) {
  vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user }) as any)
}

describe('Google Calendar availability route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ownerAllows).mockResolvedValue(true)
  })

  it('401 when unauthenticated (no anonymous token relay)', async () => {
    authed(null)
    expect((await POST(post({ calendarId: 'e2e-calendar@example.com' }))).status).toBe(401)
  })

  it('requires a calendar id', async () => {
    authed()
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'calendarId is required' })
  })

  it('returns deterministic agent-readable windows without OAuth', async () => {
    authed()
    const res = await POST(post({ calendarId: 'e2e-calendar@example.com' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.connected).toBe(false)
    expect(body.availability.source).toBe('google_calendar_stub')
    expect(body.availability.calendar_id).toBe('e2e-calendar@example.com')
    expect(body.availability.windows.length).toBeGreaterThan(0)
    expect(body.availability.generated_at).toBeTypeOf('string')
    expect(body.availability.last_synced).toBeUndefined()
    expect(body.next_available).toContain('Sample open slots:')
    expect(body.next_available).toContain('not synced with Google Calendar')
    expect(body.note).toContain('No Google Calendar connection was created')
  })

  it.each([
    ['sample', { calendarId: 'e2e-calendar@example.com' }],
    ['live-token', { calendarId: 'e2e-calendar@example.com', accessToken: 'tok' }],
  ])('402 when the %s path is used without the integrations entitlement', async (_label, body) => {
    authed()
    vi.mocked(ownerAllows).mockResolvedValue(false)
    const res = await POST(post(body))
    expect(res.status).toBe(402)
  })

  it('gates a page-scoped request on the effective page owner', async () => {
    authed()
    const res = await POST(post({ calendarId: 'e2e-calendar@example.com', pageId: 'page-1' }))
    expect(res.status).toBe(200)
    expect(resolveFeatureOwner).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'page-1',
      userId: 'owner-1',
    }))
    expect(ownerAllows).toHaveBeenCalledWith(expect.objectContaining({ admin: true }), 'page-owner-1', 'integrations')
  })

  it('documents the live-token path without calling it a stub', async () => {
    const body = await (await GET()).json()
    expect(body.note).toContain('Add accessToken for live Google Calendar free/busy')
    expect(body.message).toContain('deterministic sample availability windows')
    expect(body.note).toContain('no calendar connection is made')
    expect(body.note).not.toMatch(/Phase 3 stub/i)
  })
})
