import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gateRef, connectionRef } = vi.hoisted(() => ({
  gateRef: {
    value: {
      ok: true,
      user: { id: 'user-1' },
      access: { pageId: 'page-1', ownerId: 'owner-1' },
      admin: { from: vi.fn() },
    } as any,
  },
  connectionRef: {
    value: {
      ok: true,
      credential: { accessToken: 'google-access', refreshToken: 'refresh', tokenType: 'Bearer', expiresAt: null },
      row: {},
    } as any,
  },
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/require-page-access', () => ({
  requirePageAccess: vi.fn(async (options: { pageId: unknown }) => {
    const gate = gateRef.value
    if (!gate.ok || typeof options.pageId !== 'function') return gate
    const resolved = await options.pageId(gate.admin)
    if (resolved instanceof Response) return { ok: false, response: resolved }
    return { ...gate, access: { ...gate.access, pageId: resolved } }
  }),
}))
vi.mock('../../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => true) }))
vi.mock('../../../../../lib/server/merchant-connectors', () => ({
  getUsableConnectorCredential: vi.fn(async () => connectionRef.value),
  recordMerchantConnectorSync: vi.fn(async () => undefined),
}))

import { GET, POST } from './route'
import { ownerAllows } from '../../../../../lib/server/plan'
import { requirePageAccess } from '../../../../../lib/server/require-page-access'
import { getUsableConnectorCredential } from '../../../../../lib/server/merchant-connectors'

const post = (body: unknown, raw = false) => new Request('https://nexez.test/api/integrations/google-calendar/availability', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: raw ? String(body) : JSON.stringify(body),
})

describe('Google Calendar availability route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    gateRef.value = {
      ok: true,
      user: { id: 'user-1' },
      access: { pageId: 'page-1', ownerId: 'owner-1' },
      admin: { from: vi.fn() },
    }
    connectionRef.value = {
      ok: true,
      credential: { accessToken: 'google-access', refreshToken: 'refresh', tokenType: 'Bearer', expiresAt: null },
      row: {},
    }
    vi.mocked(ownerAllows).mockResolvedValue(true)
  })

  it('rejects invalid JSON after authentication and before any provider call', async () => {
    const response = await POST(post('{', true))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON' })
  })

  it('requires a listing so stored credentials cannot be crossed between pages', async () => {
    const response = await POST(post({ calendarId: 'primary' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'pageId is required' })
    expect(requirePageAccess).toHaveBeenCalled()
    expect(getUsableConnectorCredential).not.toHaveBeenCalled()
  })

  it('checks authentication before returning request-validation details', async () => {
    gateRef.value = { ok: false, response: Response.json({ error: 'Not authenticated' }, { status: 401 }) }
    const response = await POST(post({ calendarId: 'primary' }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Not authenticated' })
  })

  it('propagates the page access authentication boundary', async () => {
    gateRef.value = { ok: false, response: Response.json({ error: 'Not authenticated' }, { status: 401 }) }
    const response = await POST(post({ pageId: 'page-1', calendarId: 'primary' }))
    expect(response.status).toBe(401)
    expect(getUsableConnectorCredential).not.toHaveBeenCalled()
  })

  it('gates live calendar reads on the effective listing owner plan', async () => {
    vi.mocked(ownerAllows).mockResolvedValue(false)
    const response = await POST(post({ pageId: 'page-1', calendarId: 'primary' }))
    expect(response.status).toBe(402)
    expect(ownerAllows).toHaveBeenCalledWith(gateRef.value.admin, 'owner-1', 'integrations')
  })

  it('requires an encrypted stored OAuth connection and never accepts a caller token', async () => {
    connectionRef.value = { ok: false, error: 'Connect Google Calendar in Settings before syncing.' }
    const response = await POST(post({ pageId: 'page-1', calendarId: 'primary', accessToken: 'attacker-token' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Connect Google Calendar in Settings before syncing.' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads live free/busy with the stored token and returns agent-readable windows', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => new Response(JSON.stringify({
      calendars: {
        primary: {
          busy: [{ start: '2026-08-24T15:00:00.000Z', end: '2026-08-24T16:00:00.000Z' }],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(post({ pageId: 'page-1', calendarId: 'primary' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ success: true, connected: true, availability: { source: 'google_calendar', calendar_id: 'primary' } })
    expect(body.availability.last_synced).toBeTypeOf('string')
    expect(body.next_available).not.toMatch(/sample|not synced/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://www.googleapis.com/calendar/v3/freeBusy')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer google-access' })
    expect(JSON.parse(String(init?.body))).toMatchObject({ items: [{ id: 'primary' }] })
  })

  it('does not turn an inaccessible calendar into fabricated availability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      calendars: { 'missing@example.com': { errors: [{ reason: 'notFound' }], busy: [] } },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const response = await POST(post({ pageId: 'page-1', calendarId: 'missing@example.com' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('calendar ID') })
  })

  it('documents OAuth and the narrow free/busy scope without a sample path', async () => {
    const body = await (await GET()).json()
    expect(body.message).toContain('Connect Google Calendar with OAuth')
    expect(body.scope).toBe('https://www.googleapis.com/auth/calendar.freebusy')
    expect(JSON.stringify(body)).not.toMatch(/sample|accessToken/i)
  })
})
