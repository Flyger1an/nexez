import { describe, it, expect } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import { countRecentBookings } from './booking-count'

const call = (ctx: QueryContext, method: string) => ctx.calls.filter((c) => c[0] === method)

function admin(handler: (ctx: QueryContext) => { count?: number; error?: any }, contexts: QueryContext[] = []) {
  return createSupabaseMock((ctx) => {
    contexts.push(ctx)
    return { data: null, error: null, ...handler(ctx) }
  }) as any
}

const input = { slug: 'acme', offerKey: 'services-0', offerName: 'Deep Tissue Massage' }
const legOf = (ctx: QueryContext) => ctx.eqs['metadata->>calendly_event_type'] ?? 'checkout'

describe('countRecentBookings', () => {
  it('sums direct checkout bookings with net Calendly bookings (created - canceled, floored at 0)', async () => {
    const counts: Record<string, number> = { checkout: 2, 'invitee.created': 3, 'invitee.canceled': 1 }
    expect(await countRecentBookings(admin((ctx) => ({ count: counts[legOf(ctx)] })), input)).toBe(4)

    const overCanceled: Record<string, number> = { checkout: 1, 'invitee.created': 1, 'invitee.canceled': 5 }
    expect(await countRecentBookings(admin((ctx) => ({ count: overCanceled[legOf(ctx)] })), input)).toBe(1)
  })

  it('excludes owner test-mode pings from BOTH Calendly legs (synthetic bookings never move real state)', async () => {
    const contexts: QueryContext[] = []
    await countRecentBookings(admin(() => ({ count: 0 }), contexts), input)
    const calendlyLegs = contexts.filter((c) => c.eqs.offer_key === 'calendly:webhook')
    expect(calendlyLegs).toHaveLength(2)
    for (const leg of calendlyLegs) {
      expect(call(leg, 'neq')).toEqual([['neq', 'metadata->>test_mode', 'true']])
    }
    // the direct-checkout leg is scoped to the offer key + real booking events
    const checkoutLeg = contexts.find((c) => c.eqs.offer_key === 'services-0')!
    expect(call(checkoutLeg, 'in')).toEqual([['in', 'event_type', ['stripe_session_created', 'provider_redirect']]])
  })

  it('LIKE-escapes the offer name in the Calendly join (a name with % cannot over-match)', async () => {
    const contexts: QueryContext[] = []
    await countRecentBookings(admin(() => ({ count: 0 }), contexts), { ...input, offerName: '100% Deep_Clean' })
    const leg = contexts.find((c) => c.eqs.offer_key === 'calendly:webhook')!
    const ilike = call(leg, 'ilike')[0]
    expect(ilike[2]).toBe('100\\% Deep\\_Clean')
  })

  it('a failed leg counts as 0 - fails open, never phantom-blocks', async () => {
    const counts: Record<string, number> = { checkout: 2 }
    const result = await countRecentBookings(
      admin((ctx) => (legOf(ctx) === 'checkout' ? { count: counts.checkout } : { count: undefined, error: { message: 'boom' } })),
      input,
    )
    expect(result).toBe(2)
  })
})
