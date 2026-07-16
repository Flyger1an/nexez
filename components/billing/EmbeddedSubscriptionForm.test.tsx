// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'

const stripeMocks = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => null,
  useElements: () => ({ submit: stripeMocks.submit }),
  useStripe: () => ({ confirmPayment: stripeMocks.confirmPayment }),
}))

import { CheckoutFormInner } from './EmbeddedSubscriptionForm'

describe('CheckoutFormInner', () => {
  beforeEach(() => {
    stripeMocks.submit.mockReset()
    stripeMocks.confirmPayment.mockReset()
  })

  it('submits Elements before confirming the subscription payment', async () => {
    const callOrder: string[] = []
    const onSuccess = vi.fn()

    stripeMocks.submit.mockImplementation(async () => {
      callOrder.push('submit')
      return {}
    })
    stripeMocks.confirmPayment.mockImplementation(async () => {
      callOrder.push('confirm')
      return { paymentIntent: { status: 'succeeded' } }
    })

    render(
      <CheckoutFormInner
        clientSecret="pi_test_secret"
        onSuccess={onSuccess}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /subscribe & pay securely/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(callOrder).toEqual(['submit', 'confirm'])
    expect(stripeMocks.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSecret: 'pi_test_secret',
        redirect: 'if_required',
      })
    )
  })

  it('shows an Elements validation error without attempting confirmation', async () => {
    stripeMocks.submit.mockResolvedValue({
      error: { message: 'Your card details are incomplete.' },
    })

    render(<CheckoutFormInner clientSecret="pi_test_secret" />)

    fireEvent.click(screen.getByRole('button', { name: /subscribe & pay securely/i }))

    expect(await screen.findByText('Your card details are incomplete.')).toBeInTheDocument()
    expect(stripeMocks.confirmPayment).not.toHaveBeenCalled()
  })
})
