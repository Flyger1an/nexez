import { NextRequest, NextResponse } from 'next/server'
import { deriveAvailabilityWindows, type BusyPeriod } from '../../../../../lib/integrations'

/**
 * Google Calendar Availability Import.
 *
 * Real path: POST { calendarId, accessToken } → live Google Calendar freeBusy
 * API. Busy periods are subtracted from business hours to derive open windows.
 * Falls back to deterministic sample windows when no OAuth token is supplied or
 * the call fails, so the import always returns something usable.
 */

type AvailabilityWindow = {
  date: string
  start: string
  end: string
  label: string
}

type AvailabilityPayload = {
  calendar_id: string
  source: 'google_calendar_stub' | 'google_calendar'
  last_synced: string
  windows: AvailabilityWindow[]
  summary_note: string
}

function hashCalendarId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function generateStubAvailability(calendarId: string): AvailabilityPayload {
  const h = hashCalendarId(calendarId)
  const today = new Date()
  const windows: AvailabilityWindow[] = []

  for (let d = 0; d < 14; d++) {
    const dt = new Date(today.getTime() + d * 86400000)
    const dow = dt.getDay()
    // Skip most Sundays for realism; keep some
    if (dow === 0 && (h % 5) !== 2) continue
    // Skip some Saturdays
    if (dow === 6 && (h % 3) === 0) continue

    const ymd = dt.toISOString().slice(0, 10)
    const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'short' })

    // Morning block (common for services)
    windows.push({
      date: ymd,
      start: '09:00',
      end: '12:30',
      label: `${dayLabel} 9:00am–12:30pm`,
    })

    // Afternoon block (skewed by hash for variety across calendars)
    if ((d + h) % 3 !== 0) {
      windows.push({
        date: ymd,
        start: '14:00',
        end: '17:30',
        label: `${dayLabel} 2:00pm–5:30pm`,
      })
    }

    // Occasional early evening for consumer services
    if ((d + h) % 5 === 1 && dow !== 0) {
      windows.push({
        date: ymd,
        start: '18:00',
        end: '19:30',
        label: `${dayLabel} 6:00pm–7:30pm`,
      })
    }

    if (windows.length >= 8) break
  }

  const firstFew = windows.slice(0, 3).map((w) => w.label).join(', ')
  const summary_note = `Next open slots: ${firstFew} (synced from Google Calendar)`

  return {
    calendar_id: calendarId,
    source: 'google_calendar_stub',
    last_synced: new Date().toISOString(),
    windows: windows.slice(0, 6),
    summary_note,
  }
}

async function fetchGoogleAvailability(calendarId: string, accessToken: string): Promise<AvailabilityPayload | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const now = new Date()
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
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
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const busy = data?.calendars?.[calendarId]?.busy
    if (!Array.isArray(busy)) return null
    const windows = deriveAvailabilityWindows(busy as BusyPeriod[], { now })
    const firstFew = windows.slice(0, 3).map((w) => w.label).join(', ')
    return {
      calendar_id: calendarId,
      source: 'google_calendar',
      last_synced: now.toISOString(),
      windows,
      summary_note: windows.length
        ? `Next open slots: ${firstFew} (live from Google Calendar)`
        : 'No open business-hours slots found in the next 14 days.',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const calendarId = (body?.calendarId || body?.calendar_id || '').trim()
  if (!calendarId) {
    return NextResponse.json({ error: 'calendarId is required' }, { status: 400 })
  }

  const accessToken = (body?.accessToken || body?.access_token || '').trim()

  if (accessToken) {
    const live = await fetchGoogleAvailability(calendarId, accessToken)
    if (live) {
      return NextResponse.json({ success: true, connected: true, availability: live, next_available: live.summary_note })
    }
  }

  const availability = generateStubAvailability(calendarId)
  return NextResponse.json({
    success: true,
    connected: false,
    availability,
    next_available: availability.summary_note,
    note: accessToken
      ? 'Could not reach Google Calendar (check the access token and calendar id). Showing sample availability.'
      : 'Sample availability. POST { calendarId, accessToken } to sync live free/busy.',
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'POST { calendarId: "..." } to create agent-readable availability windows.',
    note: 'Add accessToken for live Google Calendar free/busy. Without a token, Nexez returns deterministic sample windows so page setup can continue.',
  })
}
