'use client'

import { useState } from 'react'
import { createClient } from '../../utils/supabase/client'

/**
 * Availability editor: keep a human-readable note alongside optional live
 * Google Calendar free/busy windows that agents can read. OAuth credentials
 * stay encrypted server-side and this component only receives open windows.
 *
 * `calendarId` and `note` stay OWNED BY THE PAGE, with their setters passed
 * through, because loadPage seeds both from the listing row when it fetches.
 * The in-flight save flag is local.
 */

/**
 * The stored note packs the human sentence and the machine windows into one
 * column, separated by a marker. Only the sentence is ever shown or edited.
 */
export function stripAvailabilityMarker(note: string | null | undefined) {
  return (note || '').split('||WINDOWS||')[0].trim()
}

export function AvailabilityPanel({
  pageId,
  integrationsAllowed,
  calendarId,
  setCalendarId,
  note,
  setNote,
  onMessage,
  onPersisted,
}: {
  /** Absent until the listing exists; generation no-ops without it. */
  pageId: string | undefined
  /** Premium live-calendar sync is gated. Manual notes remain core. */
  integrationsAllowed: boolean
  calendarId: string
  setCalendarId: (value: string) => void
  note: string
  setNote: (value: string) => void
  onMessage: (message: string) => void
  /** Lets the page mirror generated availability onto its copy of the listing. */
  onPersisted: (patch: Record<string, unknown>) => void
}) {
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const hasCalendarId = integrationsAllowed && calendarId.trim().length > 0

  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4" data-testid="availability-panel">
      <div className="text-sm font-medium text-[var(--ready)] mb-2">Availability</div>
      <p className="text-[10px] text-zinc-400 mb-3">
        Save a manual availability note on every plan. Pro and above can connect Google Calendar in Integrations, then
        sync live free/busy windows here. Nexez reads busy times, not event titles or descriptions.
      </p>

      <div className="space-y-2 mb-3">
        <label className="block text-[11px] text-zinc-400">
          Google Calendar ID
          <input
            type="text"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            disabled={!integrationsAllowed}
            placeholder="primary, yourname@gmail.com, or a shared calendar ID"
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="google-calendar-id-input"
          />
          {!integrationsAllowed ? (
            <span className="mt-1 block text-[10px] text-[var(--amber)]">Live Google Calendar sync requires Pro. A saved Calendar ID is retained, but sync is paused.</span>
          ) : null}
        </label>
        <label className="block text-[11px] text-zinc-400">
          Availability note
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Next available: This week, or specific dates/slots"
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-white"
            data-testid="availability-note-input"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={availabilitySaving}
        onClick={async () => {
          if (!pageId) return
          setAvailabilitySaving(true)
          onMessage('')
          try {
            let finalNote = note || ''
            let generatedAvailability: any = null

            const trimmedCalendarId = integrationsAllowed ? calendarId.trim() : ''

            if (trimmedCalendarId) {
              const res = await fetch('/api/integrations/google-calendar/availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ calendarId: trimmedCalendarId, pageId }),
              })
              const data = await res.json()
              if (!res.ok) throw new Error(data?.error || 'Google Calendar sync failed')
              generatedAvailability = data.availability
              finalNote = data.next_available || data.availability?.summary_note || finalNote

              // Persist structured windows for agents using a compact marker (same pattern as ||TIERS|| for zero-schema fidelity)
              if (generatedAvailability?.windows?.length) {
                const compact = JSON.stringify(generatedAvailability.windows)
                finalNote = `${finalNote} ||WINDOWS||${compact}`
              }
            }

            const payload: any = {
              next_available: finalNote || null,
              ...(integrationsAllowed ? { google_calendar_id: trimmedCalendarId || null } : {}),
            }

            const supabase = createClient()
            const { data: savedAvailability, error } = await supabase
              .from('pages')
              .update(payload)
              .eq('id', pageId)
              .select('id')
              .single()

            if (!error && savedAvailability) {
              setNote(stripAvailabilityMarker(finalNote))
              if (integrationsAllowed) setCalendarId(trimmedCalendarId)
              onPersisted({
                next_available: finalNote || null,
                ...(integrationsAllowed ? { google_calendar_id: trimmedCalendarId || null } : {}),
              })
            }

            const windowCount = generatedAvailability?.windows?.length || 0
            const successMsg = trimmedCalendarId
              ? `Live Google availability synced • ${windowCount} ${windowCount === 1 ? 'window' : 'windows'}.`
              : 'Availability saved. Visible on the public listing and in agent data.'

            onMessage(error || !savedAvailability ? error?.message || 'Availability was not saved.' : successMsg)
          } catch (e: any) {
            onMessage('Failed to sync availability: ' + e.message)
          } finally {
            setAvailabilitySaving(false)
          }
        }}
        className="mt-1 w-full rounded-lg border border-[var(--ready)]/40 px-4 py-1.5 text-sm text-[var(--ready)] hover:bg-[var(--ready)]/10 disabled:opacity-60"
        data-testid="availability-save-button"
      >
        {availabilitySaving ? 'Saving...' : hasCalendarId ? 'Sync Google availability' : 'Save Manual Availability'}
      </button>
      <p className="mt-1 text-[10px] text-zinc-500">Use primary for your main calendar. Saved notes and synced free/busy windows appear for agents immediately.</p>
    </div>
  )
}
