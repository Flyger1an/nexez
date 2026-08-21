import { describe, it, expect } from 'vitest'
import {
  applyOfferAvailability,
  applyEventTypeAvailability,
  calendlyEventTypeRefs,
  computeAvailability,
  findOfferByEventName,
  offerBookingCap,
} from './calendly-availability'
import type { OfferItem } from './agent-page'

const offer = (over: Partial<OfferItem> = {}): OfferItem => ({
  name: 'Deep Tissue Massage',
  description: 'Imported from Calendly',
  price: '$90',
  url: 'https://calendly.com/acme/deep-tissue',
  source: 'calendly',
  rules: { maxBookingsPerWeek: 3 },
  ...over,
})

describe('event-type availability', () => {
  const URI = 'https://api.calendly.com/event_types/GB'

  it('updates only the exact Calendly event type whose availability was verified', () => {
    const offers = [
      offer({ name: 'Verified', metadata: { calendly_event_type: URI } }),
      offer({ name: 'Unverified', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/OTHER' } }),
      offer({ name: 'Legacy', metadata: undefined }),
    ]
    const next = applyEventTypeAvailability(offers, { [URI]: 'sold_out' }, '2026-07-07T00:00:00.000Z')
    expect(next[0]?.availability).toBe('sold_out')
    expect(next[1]?.availability).toBeUndefined()
    expect(next[2]?.availability).toBeUndefined()
  })

  it('extracts valid duration inputs and defaults missing durations to 30 minutes', () => {
    expect(calendlyEventTypeRefs([
      offer({ duration: '60 min', metadata: { calendly_event_type: URI } }),
      offer({ duration: undefined, metadata: { calendly_event_type: 'https://api.calendly.com/event_types/OTHER' } }),
      offer({ source: undefined, metadata: { calendly_event_type: 'https://api.calendly.com/event_types/MANUAL' } }),
    ])).toEqual([
      { uri: URI, durationMinutes: 60 },
      { uri: 'https://api.calendly.com/event_types/OTHER', durationMinutes: 30 },
    ])
  })
})

describe('computeAvailability', () => {
  it('sold_out at or over the cap', () => {
    expect(computeAvailability(3, 3)).toBe('sold_out')
    expect(computeAvailability(3, 5)).toBe('sold_out')
    expect(computeAvailability(1, 1)).toBe('sold_out')
  })

  it('limited in the final third of capacity (caps > 1)', () => {
    expect(computeAvailability(3, 2)).toBe('limited') // 1 of 3 left
    expect(computeAvailability(6, 4)).toBe('limited') // 2 of 6 left
    expect(computeAvailability(10, 7)).toBe('limited') // 3 of 10 left
  })

  it('available otherwise - a cap of 1 is binary, never limited', () => {
    expect(computeAvailability(3, 0)).toBe('available')
    expect(computeAvailability(3, 1)).toBe('available')
    expect(computeAvailability(1, 0)).toBe('available')
    expect(computeAvailability(2, 1)).toBe('available')
  })
})

describe('findOfferByEventName', () => {
  const page = {
    services: [offer(), offer({ name: 'Swedish Massage' })],
    products: [offer({ name: 'Gift Card' })],
  }

  it('matches by trimmed case-insensitive name across both columns', () => {
    expect(findOfferByEventName(page, 'deep tissue massage')).toMatchObject({ kind: 'services', index: 0 })
    expect(findOfferByEventName(page, '  Swedish Massage  ')).toMatchObject({ kind: 'services', index: 1 })
    expect(findOfferByEventName(page, 'GIFT CARD')).toMatchObject({ kind: 'products', index: 0 })
  })

  it('returns null for unknown or empty event names', () => {
    expect(findOfferByEventName(page, 'Hot Stone')).toBeNull()
    expect(findOfferByEventName(page, '')).toBeNull()
    expect(findOfferByEventName(page, undefined)).toBeNull()
    expect(findOfferByEventName({ services: null, products: null }, 'Deep Tissue Massage')).toBeNull()
  })
})

describe('offerBookingCap', () => {
  it('returns the positive weekly cap, null otherwise', () => {
    expect(offerBookingCap(offer())).toBe(3)
    expect(offerBookingCap(offer({ rules: { maxBookingsPerWeek: 0 } }))).toBeNull()
    expect(offerBookingCap(offer({ rules: {} }))).toBeNull()
    expect(offerBookingCap(offer({ rules: undefined }))).toBeNull()
  })
})

describe('applyOfferAvailability', () => {
  it('sets availability immutably and stamps last_calendly_sync', () => {
    const offers = [offer()]
    const { offers: next, changed } = applyOfferAvailability(offers, 0, 'sold_out', '2026-07-07T00:00:00.000Z')
    expect(changed).toBe(true)
    expect(next[0].availability).toBe('sold_out')
    expect(next[0].metadata).toMatchObject({ last_calendly_sync: '2026-07-07T00:00:00.000Z' })
    expect(offers[0].availability).toBeUndefined() // input untouched
  })

  it('treats unset availability as available - an under-cap untouched offer stays unwritten', () => {
    const { changed } = applyOfferAvailability([offer()], 0, 'available')
    expect(changed).toBe(false)
  })

  it('no-ops when the value is already current or the index is invalid', () => {
    expect(applyOfferAvailability([offer({ availability: 'limited' })], 0, 'limited').changed).toBe(false)
    expect(applyOfferAvailability([offer()], 5, 'sold_out').changed).toBe(false)
  })

  it('preserves existing metadata when stamping', () => {
    const offers = [offer({ metadata: { imported_at: 'x' } })]
    const { offers: next } = applyOfferAvailability(offers, 0, 'limited', '2026-07-07T00:00:00.000Z')
    expect(next[0].metadata).toEqual({ imported_at: 'x', last_calendly_sync: '2026-07-07T00:00:00.000Z' })
  })
})
