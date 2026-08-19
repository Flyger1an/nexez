import { describe, expect, it } from 'vitest'
import {
  offerConfigurationPricingFingerprint,
  offerTransactionConfigurationFingerprint,
  persistCheckoutConfigurationHandoff,
} from './checkout-configuration-handoff'
import type { OfferConfigurationPricingSnapshot } from '../offer-configuration-pricing'

const configuration = { vehicle_class: 'suv' } as const
const pricing: OfferConfigurationPricingSnapshot = {
  schemaVersion: 1,
  currency: 'usd',
  baseAmount: 15000,
  adjustments: [{
    fieldKey: 'vehicle_class',
    label: 'Vehicle class',
    value: 'suv',
    model: 'option-delta',
    rule: { model: 'option-delta', adjustments: [{ value: 'suv', delta: '25' }] },
    amount: 2500,
  }],
  adjustmentAmount: 2500,
  finalAmount: 17500,
}

describe('checkout configuration handoff pricing', () => {
  it('fingerprints the complete deterministic pricing snapshot', () => {
    const first = offerConfigurationPricingFingerprint(pricing)
    const second = offerConfigurationPricingFingerprint({ ...pricing })
    const changed = offerConfigurationPricingFingerprint({ ...pricing, finalAmount: 18000 })

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toBe(first)
    expect(changed).not.toBe(first)
  })

  it('persists raw pricing only into the private handoff beside the configuration fingerprint', async () => {
    let payload: any = null
    const db = {
      from: (table: string) => ({
        upsert: async (value: unknown, options: unknown) => {
          payload = { table, value, options }
          return { error: null }
        },
      }),
    } as any

    const result = await persistCheckoutConfigurationHandoff(db, {
      stripeSessionId: 'cs_price_1',
      pageId: '11111111-1111-1111-1111-111111111111',
      offerKey: 'services-0',
      configuration: { ...configuration },
      pricing,
      now: new Date('2026-08-19T13:00:00.000Z'),
    })

    expect(result).toEqual({
      ok: true,
      fingerprint: offerTransactionConfigurationFingerprint({ ...configuration }),
      pricingFingerprint: offerConfigurationPricingFingerprint(pricing),
    })
    expect(payload.table).toBe('checkout_configuration_handoffs')
    expect(payload.options).toEqual({ onConflict: 'stripe_session_id' })
    expect(payload.value).toMatchObject({
      stripe_session_id: 'cs_price_1',
      offer_key: 'services-0',
      configuration,
      pricing_snapshot: pricing,
      pricing_fingerprint: result.pricingFingerprint,
      expires_at: '2026-08-21T13:00:00.000Z',
    })
  })

  it('keeps the legacy handoff payload free of pricing columns when no price snapshot exists', async () => {
    let value: any = null
    const db = {
      from: () => ({
        upsert: async (payload: unknown) => {
          value = payload
          return { error: null }
        },
      }),
    } as any

    const result = await persistCheckoutConfigurationHandoff(db, {
      stripeSessionId: 'cs_legacy_config',
      pageId: '11111111-1111-1111-1111-111111111111',
      offerKey: 'services-0',
      configuration: { notes: 'no fragrance' },
    })

    expect(result.ok).toBe(true)
    expect(result.pricingFingerprint).toBeNull()
    expect(value.pricing_snapshot).toBeUndefined()
    expect(value.pricing_fingerprint).toBeUndefined()
  })
})
