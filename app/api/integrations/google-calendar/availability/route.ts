import { NextResponse } from 'next/server'
import { deriveAvailabilityWindows, type BusyPeriod } from '../../../../../lib/integrations'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import {
  getUsableConnectorCredential,
  recordMerchantConnectorSync,
  type OAuthCredential,
} from '../../../../../lib/server/merchant-connectors'
import { ownerAllows } from '../../../../../lib/server/plan'
import { requirePageAccess } from '../../../../../lib/server/require-page-access'

type AvailabilityWindow = {
  date: string
  start: string
  end: string
  label: string
}

type AvailabilityPayload = {
  calendar_id: string
  source: 'google_calendar'
  generated_at: string
  last_synced: string
  windows: AvailabilityWindow[]
  summary_note: string
}

async function fetchGoogleAvailability(
  calendarId: string,
  accessToken: string,
): Promise<{ ok: true; availability: AvailabilityPayload } | { ok: false; status: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const now = new Date()
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: new Date(now.getTime() + 14 * 86400000).toISOString(),
        items: [{ id: calendarId }],
      }),
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, status: response.status }
    const data = await response.json()
    const calendar = data?.calendars?.[calendarId]
    if (!calendar || (Array.isArray(calendar.errors) && calendar.errors.length)) {
      return { ok: false, status: 400 }
    }
    const busy = calendar.busy
    if (!Array.isArray(busy)) return { ok: false, status: 502 }
    const windows = deriveAvailabilityWindows(busy as BusyPeriod[], { now })
    const firstFew = windows.slice(0, 3).map((window) => window.label).join(', ')
    const syncedAt = now.toISOString()
    return {
      ok: true,
      availability: {
        calendar_id: calendarId,
        source: 'google_calendar',
        generated_at: syncedAt,
        last_synced: syncedAt,
        windows,
        summary_note: windows.length
          ? `Next open slots: ${firstFew} (live from Google Calendar)`
          : 'No open business-hours slots found in the next 14 days.',
      },
    }
  } catch {
    return { ok: false, status: 502 }
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'google-calendar-availability', 20, 60_000)
  if (limited) return limited
  const body = await request.json().catch(() => null) as { pageId?: unknown; calendarId?: unknown; calendar_id?: unknown } | null
  const pageId = body && typeof body.pageId === 'string' ? body.pageId.trim() : ''

  const gate = await requirePageAccess({
    pageId: async () => {
      if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      if (!pageId) return NextResponse.json({ error: 'pageId is required' }, { status: 400 })
      return pageId
    },
    unavailableMessage: 'Google Calendar connections are not configured.',
  })
  if (!gate.ok) return gate.response
  const calendarId = String(body?.calendarId || body?.calendar_id || 'primary').trim() || 'primary'
  if (!(await ownerAllows(gate.admin, gate.access.ownerId, 'integrations'))) {
    return NextResponse.json({ error: 'Google Calendar availability requires Pro or higher.' }, { status: 402 })
  }
  const connection = await getUsableConnectorCredential(gate.admin, gate.access.pageId, 'google_calendar')
  if (!connection.ok) return NextResponse.json({ error: connection.error }, { status: 409 })
  const live = await fetchGoogleAvailability(calendarId, (connection.credential as OAuthCredential).accessToken)
  if (!live.ok) {
    const message = live.status === 400
      ? 'Google Calendar could not read that calendar ID. Use primary or a calendar you can access.'
      : live.status === 401
        ? 'Google Calendar authorization expired. Reconnect in Integrations.'
        : 'Google Calendar is temporarily unavailable. Try again.'
    if (live.status !== 400) {
      await recordMerchantConnectorSync(gate.admin, gate.access.pageId, 'google_calendar', { ok: false, error: message })
    }
    return NextResponse.json({ error: message }, { status: live.status === 400 ? 400 : 502 })
  }
  await recordMerchantConnectorSync(gate.admin, gate.access.pageId, 'google_calendar', {
    ok: true,
    metadata: { calendarId, windowCount: live.availability.windows.length },
  })
  return NextResponse.json({
    success: true,
    connected: true,
    availability: live.availability,
    next_available: live.availability.summary_note,
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Connect Google Calendar with OAuth, then POST { pageId, calendarId } to read live free/busy data.',
    scope: 'https://www.googleapis.com/auth/calendar.freebusy',
  })
}
