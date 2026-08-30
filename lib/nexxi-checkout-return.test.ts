import { describe, expect, it } from 'vitest'
import {
  buildNexxiCheckoutReturnUrl,
  checkoutReturnUrls,
  isNexxiBuyerAgent,
} from './nexxi-checkout-return'

describe('Nexxi checkout return URLs', () => {
  it('recognizes only the trusted Nexxi buyer-agent marker', () => {
    expect(isNexxiBuyerAgent('Nexxi')).toBe(true)
    expect(isNexxiBuyerAgent(' nexxi ')).toBe(true)
    expect(isNexxiBuyerAgent('other')).toBe(false)
    expect(isNexxiBuyerAgent(null)).toBe(false)
  })

  it('builds a universal success link with the literal Stripe session placeholder', () => {
    expect(buildNexxiCheckoutReturnUrl('https://nexez.app', 'success')).toBe(
      'https://nexez.app/nexxi/checkout/return?status=success&session_id={CHECKOUT_SESSION_ID}',
    )
  })

  it('includes a validated negotiation token and omits a checkout session id', () => {
    expect(buildNexxiCheckoutReturnUrl('https://nexez.app', 'success', {
      kind: 'negotiation',
      token: 'portal_token-123',
    })).toBe(
      'https://nexez.app/nexxi/checkout/return?status=success&kind=negotiation&token=portal_token-123',
    )
  })

  it('preserves legacy web URLs for every non-Nexxi checkout', () => {
    expect(checkoutReturnUrls({
      baseUrl: 'https://nexez.app',
      buyerAgent: 'ChatGPT',
      webSuccessUrl: 'https://nexez.app/checkout/acme/success',
      webCancelUrl: 'https://nexez.app/checkout/acme',
    })).toEqual({
      successUrl: 'https://nexez.app/checkout/acme/success',
      cancelUrl: 'https://nexez.app/checkout/acme',
      mobile: false,
    })
  })

  it('drops malformed bearer tokens instead of reflecting them', () => {
    expect(buildNexxiCheckoutReturnUrl('https://nexez.app', 'cancelled', {
      kind: 'negotiation',
      token: 'bad/token',
    })).toBe('https://nexez.app/nexxi/checkout/return?status=cancelled&kind=negotiation')
  })
})
