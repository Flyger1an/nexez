'use client'

import { useState } from 'react'
import { createClient } from '../../utils/supabase/client'

/**
 * Google Calendar availability: point the listing at a calendar, import the next
 * free window, and keep a human-readable note alongside the machine-readable
 * windows the agent reads.
 *
 * `calendarId` and `note` stay OWNED BY THE PAGE, with their setters passed
 * through, because loadPage seeds both from the listing row when it fetches.
 * The in-flight save flag is local, and so is the import itself.
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
  calendarId,
  setCalendarId,
  note,
  setNote,
  onMessage,
  onPersisted,
}: {
  /** Absent until the listing exists; import no-ops without it. */
  pageId: string | undefined
  calendarId: string
  setCalendarId: (value: string) => void
  note: string
  setNote: (value: string) => void
  onMessage: (message: string) => void
  /** Lets the page mirror the imported availability onto its copy of the listing. */
  onPersisted: (patch: Record<string, unknown>) => void
}) {
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const hasCalendarId = calendarId.trim().length > 0

  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4" data-testid="availability-panel">
      <div className="text-sm font-medium text-[var(--ready)] mb-2">Google Calendar Availability</div>
      <p className="text-[10px] text-zinc-400 mb-3">Enter a Google Calendar ID to create agent-readable availability windows, or leave it blank and save a manual availability note. Both appear on the public listing and in agent data.</p>

      <div className="space-y-2 mb-3">
        <label className="block text-[11px] text-zinc-400">
          Calendar ID
          <input
            type="text"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            placeholder="Calendar ID (e.g. yourname@gmail.com or abc123@group.calendar.google.com)"
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-white"
            data-testid="google-calendar-id-input"
          />
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
            let importedAvailability: any = null

            const trimmedCalendarId = calendarId.trim()

            if (trimmedCalendarId) {
              const res = await fetch('/api/integrations/google-calendar/availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trimmedCalendarId }),
              })
              const data = await res.json()
              if (!res.ok) throw new Error(data?.error || 'Import failed')
              importedAvailability = data.availability
              finalNote = data.next_available || data.availability?.summary_note || finalNote

              // Persist structured windows for agents using a compact marker (same pattern as ||TIERS|| for zero-schema fidelity)
              if (importedAvailability?.windows?.length) {
                const compact = JSON.stringify(importedAvailability.windows)
                finalNote = `${finalNote} ||WINDOWS||${compact}`
              }
            }

            const payload: any = {
              next_available: finalNote || null,
              google_calendar_id: trimmedCalendarId || null,
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
              setCalendarId(trimmedCalendarId)
              onPersisted({
                next_available: finalNote || null,
                google_calendar_id: trimmedCalendarId || null,
              })
            }

            const successMsg = trimmedCalendarId
              ? `Availability imported from Google Calendar • ${importedAvailability?.windows?.length || 0} windows • Last synced just now.`
              : 'Availability saved. Visible on the public listing and in agent data.'

            onMessage(error || !savedAvailability ? error?.message || 'Availability was not saved.' : successMsg)
          } catch (e: any) {
            onMessage('Failed to import availability: ' + e.message)
          } finally {
            setAvailabilitySaving(false)
          }
        }}
        className="mt-1 w-full rounded-lg border border-[var(--ready)]/40 px-4 py-1.5 text-sm text-[var(--ready)] hover:bg-[var(--ready)]/10 disabled:opacity-60"
        data-testid="availability-save-button"
      >
        {availabilitySaving ? 'Saving...' : hasCalendarId ? 'Import Availability from Google Calendar' : 'Save Manual Availability'}
      </button>
      <p className="mt-1 text-[10px] text-zinc-500">Calendar ID, imported windows, and manual notes are stored on the listing and appear for agents immediately.</p>
    </div>
  )
}
