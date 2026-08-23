import { describe, expect, it } from 'vitest'
import {
  getOfferReservableResourceTerms,
  getOfferStagedSettlementTerms,
  type ConfiguredOfferItem,
} from '../lib/configured-offer'
import { priceOfferConfiguration } from '../lib/offer-configuration-pricing'
import { resolveStagedSettlement } from '../lib/staged-settlement'
import {
  CERTIFICATION_MARKER,
  assertCertificationOwnerReady,
  assertSafeExistingServices,
  assertSafePool,
  assertSafePools,
  assertSafeTargetPage,
  assertSafeWindows,
  buildCertificationOffers,
  buildCertificationPage,
  buildCertificationPool,
  buildCertificationWindow,
  sameJson,
  selectReusableCertificationWindow,
} from './party-rentals-certification.mjs'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const PAGE_ID = '22222222-2222-4222-8222-222222222222'
const POOL_ID = '33333333-3333-4333-8333-333333333333'
const WINDOW_ID = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-08-23T12:00:00.000Z')

function certificationOffers(): ConfiguredOfferItem[] {
  return buildCertificationOffers(POOL_ID, WINDOW_ID) as ConfiguredOfferItem[]
}

describe('Party Rentals certification setup contract', () => {
  it('builds an unpublished private fixture and never copies settlement identity', () => {
    const page = buildCertificationPage(OWNER_ID)
    expect(page).toMatchObject({
      owner_id: OWNER_ID,
      is_published: false,
      currency: 'usd',
      agent_memory: { notes: CERTIFICATION_MARKER },
    })
    expect(JSON.stringify(page)).not.toMatch(/stripe|connect|account/i)
  })

  it('keeps reservable inventory and staged payments on separate valid offers', () => {
    const [resource, staged] = certificationOffers()

    expect(getOfferReservableResourceTerms(resource)).toMatchObject({
      requirements: [{ poolId: POOL_ID, windowId: WINDOW_ID }],
    })
    expect(getOfferStagedSettlementTerms(resource)).toBeNull()
    expect(getOfferStagedSettlementTerms(staged)).toMatchObject({
      approvalPolicy: 'buyer-approves-each-stage',
      stages: [
        { allocationBps: 5000 },
        { allocationBps: 5000 },
      ],
    })
    expect(getOfferReservableResourceTerms(staged)).toBeNull()
  })

  it('prices the certification paths at one dollar and two one-dollar stages', () => {
    const [resource, staged] = certificationOffers()
    expect(priceOfferConfiguration(resource, { 'chair-count': 2 }, 'usd')).toMatchObject({
      ok: true,
      amountCents: 100,
      pricing: { finalAmount: 100 },
    })
    const stagedPrice = priceOfferConfiguration(staged, {}, 'usd')
    if (!stagedPrice.ok) throw new Error(stagedPrice.error)
    expect(stagedPrice).toMatchObject({
      ok: true,
      amountCents: 200,
    })
    const terms = getOfferStagedSettlementTerms(staged)
    expect(terms?.stages.map((stage) => stage.allocationBps)).toEqual([5000, 5000])
    expect(resolveStagedSettlement({ terms: terms!, totalAmount: stagedPrice.amountCents!, currency: 'usd' })).toMatchObject({
      ok: true,
      value: { stages: [{ amountCents: 100 }, { amountCents: 100 }] },
    })
  })

  it('creates a bounded future window and reuses the earliest viable managed window', () => {
    const draft = buildCertificationWindow(POOL_ID, NOW)
    expect(draft).toMatchObject({
      pool_id: POOL_ID,
      total_quantity: 4,
      status: 'active',
    })
    expect(Date.parse(draft.ends_at) - Date.parse(draft.starts_at)).toBe(4 * 60 * 60 * 1000)

    const later = { ...buildCertificationWindow(POOL_ID, new Date('2026-08-26T12:00:00.000Z')), id: WINDOW_ID }
    const earlier = { ...buildCertificationWindow(POOL_ID, new Date('2026-08-25T12:00:00.000Z')), id: '55555555-5555-4555-8555-555555555555' }
    expect(selectReusableCertificationWindow([later, earlier], NOW)?.id).toBe(earlier.id)
  })

  it('fails closed on ownership, publication, settlement, pool, window, or offer drift', () => {
    expect(() => assertCertificationOwnerReady(
      { id: PAGE_ID, owner_id: OWNER_ID },
      { stripe_connect_account_id: 'acct_ready', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true },
    )).not.toThrow()
    expect(() => assertCertificationOwnerReady(
      { id: PAGE_ID, owner_id: OWNER_ID },
      { stripe_connect_account_id: 'acct_partial', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: false },
    )).toThrow(/not ready/)
    expect(() => assertSafeTargetPage({ owner_id: OWNER_ID, is_published: false, products: [], agent_memory: { notes: CERTIFICATION_MARKER } }, OWNER_ID)).not.toThrow()
    expect(() => assertSafeTargetPage({ owner_id: OWNER_ID, is_published: true, products: [], agent_memory: { notes: CERTIFICATION_MARKER } }, OWNER_ID)).toThrow(/published/)
    expect(() => assertSafeTargetPage({ owner_id: 'other', is_published: false, products: [], agent_memory: { notes: CERTIFICATION_MARKER } }, OWNER_ID)).toThrow(/different owner/)
    expect(() => assertSafeTargetPage({ owner_id: OWNER_ID, is_published: false, products: [{ name: 'extra' }], agent_memory: { notes: CERTIFICATION_MARKER } }, OWNER_ID)).toThrow(/unmanaged products/)

    const pool = { id: POOL_ID, ...buildCertificationPool(PAGE_ID, OWNER_ID) }
    expect(() => assertSafePool(pool, PAGE_ID, OWNER_ID)).not.toThrow()
    expect(() => assertSafePool({ ...pool, total_quantity: 99 }, PAGE_ID, OWNER_ID)).toThrow(/drift/)
    expect(() => assertSafePools([], PAGE_ID, OWNER_ID)).not.toThrow()
    expect(() => assertSafePools([pool], PAGE_ID, OWNER_ID)).not.toThrow()
    expect(() => assertSafePools([pool, { ...pool, id: WINDOW_ID }], PAGE_ID, OWNER_ID)).toThrow(/unmanaged/)
    const window = { id: WINDOW_ID, ...buildCertificationWindow(POOL_ID, NOW) }
    expect(() => assertSafeWindows([window], POOL_ID)).not.toThrow()
    expect(() => assertSafeWindows([{ ...window, total_quantity: 99 }], POOL_ID)).toThrow(/unmanaged/)

    const offers = certificationOffers()
    expect(() => assertSafeExistingServices(offers, POOL_ID, new Set([WINDOW_ID]))).not.toThrow()
    expect(() => assertSafeExistingServices([{ ...offers[0], price: '$99.00' }, offers[1]], POOL_ID, new Set([WINDOW_ID]))).toThrow(/drift/)
  })

  it('treats reordered JSON object keys as the same managed contract', () => {
    expect(sameJson(
      { services: [{ name: 'Fixture', terms: { version: 1, policy: 'buyer' } }] },
      { services: [{ terms: { policy: 'buyer', version: 1 }, name: 'Fixture' }] },
    )).toBe(true)
  })
})
