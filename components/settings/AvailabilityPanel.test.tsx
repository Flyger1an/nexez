// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { AvailabilityPanel, stripAvailabilityMarker } from './AvailabilityPanel'

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'page-1' }, error: null }) }) }) }),
    }),
  }),
}))

function setup(overrides: Partial<React.ComponentProps<typeof AvailabilityPanel>> = {}) {
  const setCalendarId = vi.fn()
  const setNote = vi.fn()
  const onMessage = vi.fn()
  const onPersisted = vi.fn()
  render(
    <AvailabilityPanel
      pageId="page-1"
      integrationsAllowed
      calendarId=""
      setCalendarId={setCalendarId}
      note=""
      setNote={setNote}
      onMessage={onMessage}
      onPersisted={onPersisted}
      {...overrides}
    />,
  )
  return { setCalendarId, setNote, onMessage, onPersisted }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// The stored column packs a human sentence and machine-readable windows together.
// Only the sentence is ever shown, so the split has to survive refactoring.
describe('stripAvailabilityMarker', () => {
  it('keeps only the human sentence', () => {
    expect(stripAvailabilityMarker('Next week ||WINDOWS|| 2026-08-20T10:00Z')).toBe('Next week')
  })

  it('is a no-op when there are no windows', () => {
    expect(stripAvailabilityMarker('Next week')).toBe('Next week')
  })

  it('handles null and empty input', () => {
    expect(stripAvailabilityMarker(null)).toBe('')
    expect(stripAvailabilityMarker(undefined)).toBe('')
    expect(stripAvailabilityMarker('')).toBe('')
  })

  it('trims the sentence it returns', () => {
    expect(stripAvailabilityMarker('  Next week  ||WINDOWS||x')).toBe('Next week')
  })
})

describe('AvailabilityPanel', () => {
  it('offers manual save until a calendar is set, then offers explicit sample generation', () => {
    setup()
    expect(screen.getByTestId('availability-save-button').textContent).toBe('Save Manual Availability')

    setup({ calendarId: 'me@gmail.com' })
    expect(screen.getAllByTestId('availability-save-button')[1]!.textContent).toBe('Generate Sample Availability')
    expect(screen.getAllByText(/does not connect to or read your Google Calendar/i)).not.toHaveLength(0)
  })

  it('reports calendar id edits upward rather than owning them', () => {
    const { setCalendarId } = setup()
    fireEvent.change(screen.getByTestId('google-calendar-id-input'), { target: { value: 'me@gmail.com' } })
    expect(setCalendarId).toHaveBeenCalledWith('me@gmail.com')
  })

  it('keeps manual notes available but pauses sample generation below Pro', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { setCalendarId } = setup({ integrationsAllowed: false, calendarId: 'saved@gmail.com' })

    expect(screen.getByTestId('google-calendar-id-input')).toBeDisabled()
    expect(screen.getByTestId('availability-save-button')).toHaveTextContent('Save Manual Availability')
    expect(screen.getByText(/saved Calendar ID is retained, but generation is paused/i)).toBeVisible()
    expect(setCalendarId).not.toHaveBeenCalled()
  })

  it('sends the documented calendarId key and reports a sample response truthfully', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        success: true,
        connected: false,
        availability: {
          source: 'google_calendar_stub',
          windows: [{ date: '2026-08-24', start: '09:00', end: '12:30', label: 'Mon 9:00am–12:30pm' }],
          summary_note: 'Sample open slots: Mon 9:00am–12:30pm (not synced with Google Calendar)',
        },
        next_available: 'Sample open slots: Mon 9:00am–12:30pm (not synced with Google Calendar)',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { onMessage, onPersisted } = setup({ calendarId: '  me@gmail.com  ' })

    fireEvent.click(screen.getByTestId('availability-save-button'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]!
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(String(init?.body))).toEqual({ calendarId: 'me@gmail.com', pageId: 'page-1' })
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(
        'Sample availability generated • 1 window • No Google Calendar connection was created.',
      )
    })
    expect(onMessage).not.toHaveBeenCalledWith(expect.stringMatching(/imported|last synced/i))
    expect(onPersisted).toHaveBeenCalledWith(expect.objectContaining({
      google_calendar_id: 'me@gmail.com',
      next_available: expect.stringMatching(/^Sample open slots:.*\|\|WINDOWS\|\|/),
    }))
  })

  it('reports note edits upward', () => {
    const { setNote } = setup()
    fireEvent.change(screen.getByTestId('availability-note-input'), { target: { value: 'Fridays' } })
    expect(setNote).toHaveBeenCalledWith('Fridays')
  })

  it('renders the note it is given, not a stale local copy', () => {
    setup({ note: 'Tuesdays and Thursdays' })
    expect((screen.getByTestId('availability-note-input') as HTMLInputElement).value).toBe(
      'Tuesdays and Thursdays',
    )
  })

  it('does nothing before the listing exists', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { onPersisted } = setup({ pageId: undefined, calendarId: 'me@gmail.com' })
    fireEvent.click(screen.getByTestId('availability-save-button'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onPersisted).not.toHaveBeenCalled()
  })
})
