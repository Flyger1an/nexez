import { describe, expect, it } from 'vitest'
import {
  sessionInsertValues,
  sessionUpdateValues,
  rowToSession,
  defaultSessionExpiry,
  isSessionExpired,
  persistSession,
  updateSessionSnapshot,
  type CheckoutSessionRow,
} from '../server/checkout-session-store'
import { createSession, type SessionPage } from '../commerce/checkout-session-core'
import type { OfferItem } from '../agent-page'

function offer(partial: Partial<OfferItem> & { name: string; price: string }): OfferItem {
  return { description: '', url: '', ...partial }
}

function makePage(): SessionPage {
  return {
    slug: 'acme',
    name: 'Acme Studio',
    currency: 'usd',
    services: [offer({ name: 'Strategy Session', price: '$1,200' })],
    products: [],
  }
}

const NOW = 1_700_000_000_000

function readySession() {
  return createSession({ id: 'sess_1', page: makePage(), items: [{ offer: 'services-0' }] })
}

describe('sessionInsertValues', () => {
  it('maps a session + meta to row values', () => {
    const s = readySession()
    const values = sessionInsertValues(s, {
      channel: 'acp',
      pageId: 'page_1',
      ownerId: 'owner_1',
      idempotencyKey: 'idem_1',
      apiVersion: '2026-04-17',
      expiresAt: '2026-07-12T01:00:00.000Z',
    })
    expect(values).toMatchObject({
      id: 'sess_1',
      channel: 'acp',
      page_id: 'page_1',
      slug: 'acme',
      owner_id: 'owner_1',
      status: 'ready',
      currency: 'usd',
      idempotency_key: 'idem_1',
      api_version: '2026-04-17',
      expires_at: '2026-07-12T01:00:00.000Z',
      stripe_payment_intent_id: null,
    })
    expect(values.line_items).toHaveLength(1)
    expect(values.totals.total).toBe(120000)
  })

  it('defaults optional meta to null', () => {
    const values = sessionInsertValues(readySession(), { channel: 'ucp', pageId: 'p', ownerId: null, expiresAt: 'x' })
    expect(values.owner_id).toBeNull()
    expect(values.idempotency_key).toBeNull()
    expect(values.api_version).toBeNull()
    expect(values.stripe_payment_intent_id).toBeNull()
  })
})

describe('sessionUpdateValues', () => {
  it('writes only mutable fields; PI only when provided', () => {
    const s = readySession()
    expect(sessionUpdateValues(s)).toEqual({
      status: 'ready',
      currency: 'usd',
      line_items: s.lineItems,
      buyer: null,
      totals: s.totals,
    })
    const withPi = sessionUpdateValues(s, { stripePaymentIntentId: 'pi_9' })
    expect(withPi.stripe_payment_intent_id).toBe('pi_9')
  })
})

describe('rowToSession', () => {
  const baseRow: CheckoutSessionRow = {
    id: 'sess_1',
    channel: 'acp',
    page_id: 'page_1',
    slug: 'acme',
    owner_id: 'owner_1',
    status: 'ready',
    currency: 'usd',
    line_items: readySession().lineItems,
    buyer: { email: 'b@x.com' },
    totals: { currency: 'usd', subtotal: 120000, tax: 0, total: 120000 },
    idempotency_key: null,
    stripe_payment_intent_id: null,
    api_version: null,
    expires_at: '2026-07-12T01:00:00.000Z',
  }

  it('rehydrates a CheckoutSession the core can act on (issues empty)', () => {
    const s = rowToSession(baseRow, 'Acme Studio')
    expect(s.id).toBe('sess_1')
    expect(s.status).toBe('ready')
    expect(s.currency).toBe('usd')
    expect(s.issues).toEqual([])
    expect(s.buyer).toEqual({ email: 'b@x.com' })
    expect(s.source).toEqual({ slug: 'acme', pageName: 'Acme Studio' })
    expect(s.totals.total).toBe(120000)
  })

  it('maps a DB-only "expired" status to the terminal "canceled"', () => {
    const s = rowToSession({ ...baseRow, status: 'expired' }, 'Acme Studio')
    expect(s.status).toBe('canceled')
  })

  it('round-trips: session -> insert values -> row -> session', () => {
    const original = readySession()
    const values = sessionInsertValues(original, { channel: 'acp', pageId: 'page_1', ownerId: 'owner_1', expiresAt: 'x' })
    const row = { ...values, created_at: 'n', updated_at: 'n' } as unknown as CheckoutSessionRow
    const rehydrated = rowToSession(row, original.source.pageName)
    expect(rehydrated.lineItems).toEqual(original.lineItems)
    expect(rehydrated.totals).toEqual(original.totals)
    expect(rehydrated.status).toBe(original.status)
  })
})

describe('expiry helpers', () => {
  it('defaultSessionExpiry is ~45 min ahead by default', () => {
    expect(defaultSessionExpiry(NOW)).toBe(new Date(NOW + 45 * 60_000).toISOString())
    expect(defaultSessionExpiry(NOW, 30)).toBe(new Date(NOW + 30 * 60_000).toISOString())
  })

  it('isSessionExpired reflects the wall clock', () => {
    expect(isSessionExpired({ expires_at: new Date(NOW - 1000).toISOString() }, NOW)).toBe(true)
    expect(isSessionExpired({ expires_at: new Date(NOW + 60_000).toISOString() }, NOW)).toBe(false)
    expect(isSessionExpired({ expires_at: 'not-a-date' }, NOW)).toBe(true) // safe default
  })
})

/** A thenable Supabase chain stub: records insert/update payloads, resolves every
 * terminal (single/maybeSingle/awaited eq) to the configured result. */
function fakeAdmin(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const calls: Array<{ op: string; table: string; payload?: unknown }> = []
  let table = ''
  const chain: any = {
    insert(v: unknown) { calls.push({ op: 'insert', table, payload: v }); return chain },
    update(v: unknown) { calls.push({ op: 'update', table, payload: v }); return chain },
    select() { return chain },
    eq() { return chain },
    single: async () => result,
    maybeSingle: async () => result,
    then(resolve: (r: unknown) => unknown) { return Promise.resolve(result).then(resolve) },
  }
  return { calls, from(t: string) { table = t; return chain } } as any
}

describe('service-role CRUD', () => {
  it('persistSession returns the row on success and null on error', async () => {
    const row = { id: 'sess_1' } as CheckoutSessionRow
    const okAdmin = fakeAdmin({ data: row, error: null })
    const ok = await persistSession(okAdmin, readySession(), { channel: 'acp', pageId: 'p', ownerId: 'o', expiresAt: 'x' })
    expect(ok).toBe(row)
    expect(okAdmin.calls[0]).toMatchObject({ op: 'insert', table: 'checkout_sessions' })

    const errAdmin = fakeAdmin({ data: null, error: { message: 'boom' } })
    const failed = await persistSession(errAdmin, readySession(), { channel: 'acp', pageId: 'p', ownerId: 'o', expiresAt: 'x' })
    expect(failed).toBeNull()
  })

  it('updateSessionSnapshot returns true/false on error state', async () => {
    expect(await updateSessionSnapshot(fakeAdmin({ error: null }), 'sess_1', readySession())).toBe(true)
    expect(await updateSessionSnapshot(fakeAdmin({ error: { message: 'x' } }), 'sess_1', readySession())).toBe(false)
  })
})
