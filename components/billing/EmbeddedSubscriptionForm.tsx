'use client'

import React, { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import type { BillingPlan } from '../../lib/billing'

/**
 * Embedded Subscription Form (Stripe Elements + PaymentElement)
 *
 * Used on /dashboard/billing for recurring subscriptions on paid plans.
 * 
 * Flow:
 * 1. Parent calls /api/billing/create-subscription with plan -> gets clientSecret
 * 2. Mounts this <Elements> wrapper + inner form
 * 3. User enters card details in PaymentElement
 * 4. On submit: stripe.confirmPayment({ elements, clientSecret, confirmParams, redirect: 'if_required' })
 * 5. On success: parent can refresh billing state (webhook will have updated billing_subscriptions)
 *
 * IMPORTANT:
 * - Requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in env (publishable, safe for client).
 * - This is ONLY for Nexez subscription billing (paid plans). Transaction commissions use separate Stripe Connect flow.
 * - Free plan: never reaches here.
 * - Production-ready: basic loading/error states, logs errors.
 */

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
)

interface EmbeddedSubscriptionFormProps {
  plan: BillingPlan
  clientSecret: string
  onSuccess?: () => void
  onCancel?: () => void
}

function CheckoutFormInner({ clientSecret, onSuccess, onCancel }: { clientSecret: string; onSuccess?: () => void; onCancel?: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          // We handle success ourselves (no full redirect for better UX).
          // If 3DS or redirect required, Stripe will handle.
          return_url: `${window.location.origin}/dashboard/billing/success?embedded_success=1`,
        },
        redirect: 'if_required',
      })

      if (error) {
        console.error('[EmbeddedSubscription] confirmPayment error', error)
        setErrorMessage(error.message || 'Payment failed. Please try again or use a different card.')
      } else if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
        // Success (or processing for some methods). Webhook will sync billing_subscriptions.
        console.log('[EmbeddedSubscription] Payment confirmed', paymentIntent.id)
        onSuccess?.()
      } else {
        setErrorMessage('Payment requires additional action. Please follow the prompts or check your email.')
      }
    } catch (err: any) {
      console.error('[EmbeddedSubscription] Unexpected error', err)
      setErrorMessage('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {errorMessage && (
        <div className="rounded border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!stripe || isLoading}
          className="flex-1 rounded-lg bg-[#7C3AED] py-3 text-sm font-medium text-white disabled:opacity-60 hover:bg-[#6D28D9]"
        >
          {isLoading ? 'Processing payment…' : 'Subscribe & pay securely'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg border border-white/15 px-5 py-3 text-sm hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="text-center text-[10px] text-zinc-500">
        Secured by Stripe. Card details never touch our servers.
      </p>
    </form>
  )
}

export default function EmbeddedSubscriptionForm({ plan, clientSecret, onSuccess, onCancel }: EmbeddedSubscriptionFormProps) {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="rounded-lg border border-amber-200/30 bg-amber-200/10 p-4 text-sm text-amber-100">
        Stripe publishable key is missing (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). Embedded checkout unavailable. Use the hosted upgrade button instead.
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-[#0F0D18] p-5">
      <div className="mb-4">
        <div className="text-sm font-medium">Complete your {plan.name} subscription</div>
        <div className="text-xs text-[#9CA3AF]">{plan.price}/{plan.cadence} • Cancel anytime via Stripe portal</div>
      </div>

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: 'night',
            variables: {
              colorPrimary: '#7C3AED',
              colorBackground: '#0F0D18',
              colorText: '#ffffff',
              colorDanger: '#ef4444',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              spacingUnit: '4px',
              borderRadius: '8px',
            },
          },
        }}
      >
        <CheckoutFormInner clientSecret={clientSecret} onSuccess={onSuccess} onCancel={onCancel} />
      </Elements>
    </div>
  )
}
