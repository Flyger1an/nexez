import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))

import { GET, POST } from './route'
import { createClient } from '../../../../../utils/supabase/server'
import { ownerAllows } from '../../../../../lib/server/plan'

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
    expect(body.availability.calendar_id).toBe('e2e-calendar@example.com')
    expect(body.availability.windows.length).toBeGreaterThan(0)
    expect(body.next_available).toContain('Next open slots:')
  })

  it('402 when the live-token path is used without the integrations entitlement', async () => {
    authed()
    vi.mocked(ownerAllows).mockResolvedValue(false)
    const res = await POST(post({ calendarId: 'e2e-calendar@example.com', accessToken: 'tok' }))
    expect(res.status).toBe(402)
  })

  it('documents the live-token path without calling it a stub', async () => {
    const body = await (await GET()).json()
    expect(body.note).toContain('Add accessToken for live Google Calendar free/busy')
    expect(body.note).not.toMatch(/Phase 3 stub/i)
  })
})
