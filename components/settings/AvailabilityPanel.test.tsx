// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '../../test/dom'
import { AvailabilityPanel, stripAvailabilityMarker } from './AvailabilityPanel'

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
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
  it('offers manual save until a calendar is set, then offers import', () => {
    setup()
    expect(screen.getByTestId('availability-save-button').textContent).toBe('Save Manual Availability')

    setup({ calendarId: 'me@gmail.com' })
    expect(screen.getAllByTestId('availability-save-button')[1]!.textContent).toBe(
      'Import Availability from Google Calendar',
    )
  })

  it('reports calendar id edits upward rather than owning them', () => {
    const { setCalendarId } = setup()
    fireEvent.change(screen.getByTestId('google-calendar-id-input'), { target: { value: 'me@gmail.com' } })
    expect(setCalendarId).toHaveBeenCalledWith('me@gmail.com')
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
