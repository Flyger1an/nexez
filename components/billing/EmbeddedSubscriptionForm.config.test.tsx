// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../test/dom'

const stripeLoader = vi.hoisted(() => ({
  loadStripe: vi.fn(),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: stripeLoader.loadStripe,
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => null,
  useElements: () => null,
  useStripe: () => null,
}))

const originalPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

async function loadForm() {
  return (await import('./EmbeddedSubscriptionForm')).default
}

describe('EmbeddedSubscriptionForm Stripe initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    stripeLoader.loadStripe.mockReset()
  })

  afterEach(() => {
    if (originalPublishableKey == null) {
      delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    } else {
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = originalPublishableKey
    }
  })

  it('does not initialize Stripe.js when the publishable key is missing', async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    const EmbeddedSubscriptionForm = await loadForm()

    expect(stripeLoader.loadStripe).not.toHaveBeenCalled()

    render(
      <EmbeddedSubscriptionForm
        plan={{ id: 'pro', name: 'Pro', price: '$99', cadence: 'month' } as any}
        clientSecret="pi_test_secret"
      />,
    )

    expect(screen.getByText(/Embedded checkout is unavailable right now/i)).toBeInTheDocument()
  })

  it('initializes Stripe.js exactly once with a configured publishable key', async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_configured'
    stripeLoader.loadStripe.mockReturnValue(Promise.resolve(null) as any)

    await loadForm()

    expect(stripeLoader.loadStripe).toHaveBeenCalledTimes(1)
    expect(stripeLoader.loadStripe).toHaveBeenCalledWith('pk_test_configured')
  })
})
