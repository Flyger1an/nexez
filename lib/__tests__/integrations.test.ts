import { describe, it, expect } from 'vitest'
import { mapSquareCatalogToOffers, mapAcuityTypesToOffers, deriveAvailabilityWindows } from '../integrations'

describe('mapSquareCatalogToOffers', () => {
  it('maps catalog items, turning multiple variations into tiers + a "From" price', () => {
    const objects = [
      {
        type: 'ITEM',
        id: 'sq1',
        item_data: {
          name: 'Deep Tissue Massage',
          description: 'Therapeutic <b>work</b>.',
          variations: [
            { item_variation_data: { name: '60 min', price_money: { amount: 9500, currency: 'USD' } } },
            { item_variation_data: { name: '90 min', price_money: { amount: 13500, currency: 'USD' } } },
          ],
        },
      },
      { type: 'CATEGORY', id: 'c1', category_data: { name: 'ignore me' } },
    ]
    const offers = mapSquareCatalogToOffers(objects)
    expect(offers).toHaveLength(1)
    expect(offers[0].name).toBe('Deep Tissue Massage')
    expect(offers[0].description).toBe('Therapeutic work.') // html stripped
    expect(offers[0].price).toBe('From $95')
    expect(offers[0].source).toBe('square')
    expect(offers[0].tiers).toEqual([
      { name: '60 min', price: '$95' },
      { name: '90 min', price: '$135' },
    ])
    expect(offers[0].metadata?.square_item_id).toBe('sq1')
  })

  it('single-variation items get a plain price and no tiers', () => {
    const offers = mapSquareCatalogToOffers([
      { type: 'ITEM', id: 'sq2', item_data: { name: 'Facial', variations: [{ item_variation_data: { price_money: { amount: 11000 } } }] } },
    ])
    expect(offers[0].price).toBe('$110')
    expect(offers[0].tiers).toBeUndefined()
  })
})

describe('mapAcuityTypesToOffers', () => {
  it('maps appointment types with price + duration and strips html', () => {
    const offers = mapAcuityTypesToOffers([
      { id: 12, name: 'Strategy Session', description: '<p>Deep dive</p>', price: '250.00', duration: 90 },
      { id: 13, name: 'Discovery Call', description: '', price: '0', duration: 30 },
      { name: '', price: '10' }, // dropped (no name)
    ])
    expect(offers).toHaveLength(2)
    expect(offers[0]).toMatchObject({ name: 'Strategy Session', price: '$250', duration: '90 min', source: 'acuity' })
    expect(offers[0].description).toBe('Deep dive')
    expect(offers[1].price).toBe('$0')
  })
})

describe('deriveAvailabilityWindows', () => {
  it('subtracts busy periods from business hours on weekdays', () => {
    // Monday 2026-06-08, busy 10:00–11:00 local
    const now = new Date('2026-06-08T08:00:00')
    const busy = [{ start: '2026-06-08T10:00:00', end: '2026-06-08T11:00:00' }]
    const windows = deriveAvailabilityWindows(busy, { now, max: 3, days: 1 })
    // expect a morning gap (09:00–10:00) and an afternoon gap (11:00–17:00)
    expect(windows.length).toBeGreaterThanOrEqual(2)
    expect(windows[0].start).toBe('09:00')
    expect(windows[0].end).toBe('10:00')
    expect(windows.some((w) => w.start === '11:00')).toBe(true)
  })

  it('skips weekends entirely', () => {
    // Saturday 2026-06-06
    const now = new Date('2026-06-06T08:00:00')
    const windows = deriveAvailabilityWindows([], { now, days: 1 })
    expect(windows).toHaveLength(0)
  })

  it('a fully-busy day yields no windows', () => {
    const now = new Date('2026-06-08T07:00:00')
    const busy = [{ start: '2026-06-08T09:00:00', end: '2026-06-08T17:00:00' }]
    const windows = deriveAvailabilityWindows(busy, { now, days: 1 })
    expect(windows).toHaveLength(0)
  })
})
