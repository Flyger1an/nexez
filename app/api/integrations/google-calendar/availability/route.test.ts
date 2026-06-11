import { describe, expect, it } from 'vitest'
import { GET, POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/integrations/google-calendar/availability', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

describe('Google Calendar availability route', () => {
  it('requires a calendar id', async () => {
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'calendarId is required' })
  })

  it('returns deterministic agent-readable windows without OAuth', async () => {
    const res = await POST(post({ calendarId: 'e2e-calendar@example.com' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.connected).toBe(false)
    expect(body.availability.calendar_id).toBe('e2e-calendar@example.com')
    expect(body.availability.windows.length).toBeGreaterThan(0)
    expect(body.next_available).toContain('Next open slots:')
  })

  it('documents the live-token path without calling it a stub', async () => {
    const body = await (await GET()).json()
    expect(body.note).toContain('Add accessToken for live Google Calendar free/busy')
    expect(body.note).not.toMatch(/Phase 3 stub/i)
  })
})
