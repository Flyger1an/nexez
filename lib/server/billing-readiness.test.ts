import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStripeBillingReadiness } from './billing-readiness'

function configurePrices(launch: string, pro: string, scale: string) {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
  vi.stubEnv('STRIPE_PRICE_LAUNCH', launch)
  vi.stubEnv('STRIPE_PRICE_PRO', pro)
  vi.stubEnv('STRIPE_PRICE_SCALE', scale)
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_LAUNCH', '')
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_PRO', '')
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_SCALE', '')
}

afterEach(() => vi.unstubAllEnvs())

describe('Stripe billing catalog readiness', () => {
  it('accepts three distinct self-serve Price IDs', () => {
    configurePrices('price_launch', 'price_pro', 'price_scale')
    expect(getStripeBillingReadiness()).toMatchObject({
      priceIdsDistinct: true,
      subscriptionCheckoutReady: true,
    })
  })

  it('fails closed when two plans share a Stripe Price', () => {
    configurePrices('price_shared', 'price_shared', 'price_scale')
    expect(getStripeBillingReadiness()).toMatchObject({
      priceIdsDistinct: false,
      subscriptionCheckoutReady: false,
      productionReady: false,
    })
  })
})
