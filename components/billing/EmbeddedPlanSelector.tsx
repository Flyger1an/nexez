'use client'

import React, { useState, useEffect } from 'react'
import EmbeddedSubscriptionForm from './EmbeddedSubscriptionForm'
import { billingPlans, getPlanPriceId } from '../../lib/billing'
import type { BillingSubscription } from '../../lib/stripe-billing'

/**
 * Client component for plan selection + Embedded Subscription checkout (Stripe Elements).
 * Primary recurring sub flow for paid plans.
 *
 * See app/api/billing/create-subscription/route.ts for the server counterpart.
 */

interface EmbeddedPlanSelectorProps {
  activePlanId: string
  billingState: BillingSubscription | null
  stripeReady: boolean
  initialPlanId?: string | null
}

export default function EmbeddedPlanSelector({ activePlanId, billingState, stripeReady, initialPlanId }: EmbeddedPlanSelectorProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId || null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const filteredPlans = billingPlans.filter((p) => p.id !== activePlanId && p.id !== 'free')

  async function startEmbeddedCheckout(planId: string) {
    if (!stripeReady) {
      setError('Stripe is not fully configured yet. Use the "Configure Stripe" option or contact support.')
      return
    }

    setLoadingPlan(planId)
    setError(null)
    setSuccessMessage(null)
    setClientSecret(null)
    setSelectedPlanId(planId)

    try {
      const res = await fetch('/api/billing/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      })

      const data = await res.json()

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || 'Failed to initialize embedded checkout.')
      }

      setClientSecret(data.clientSecret)
    } catch (e: any) {
      console.error('[EmbeddedPlanSelector] create-subscription failed', e)
      setError(e.message || 'Could not start checkout. Please try the hosted option below or refresh.')
      setSelectedPlanId(null)
    } finally {
      setLoadingPlan(null)
    }
  }

  // Auto-start if linked from /pricing with ?plan=...
  useEffect(() => {
    if (initialPlanId && !clientSecret && !loadingPlan) {
      const valid = filteredPlans.some(p => p.id === initialPlanId)
      if (valid) {
        startEmbeddedCheckout(initialPlanId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlanId])

  function handleEmbeddedSuccess() {
    setSuccessMessage('Payment confirmed! Your subscription is being activated. Billing status will update via webhook shortly.')
    setClientSecret(null)
    setSelectedPlanId(null)

    // Polish: send to dedicated success page (handles both hosted + embedded flows)
    const planParam = selectedPlanId ? `&plan=${selectedPlanId}` : ''
    setTimeout(() => {
      window.location.href = `/dashboard/billing/success?embedded_success=1${planParam}`
    }, 1100)
  }

  function resetEmbedded() {
    setClientSecret(null)
    setSelectedPlanId(null)
    setError(null)
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-4">Change plan (Embedded checkout)</h2>

      {successMessage && (
        <div className="mb-4 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm text-emerald-200">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {filteredPlans.map((plan) => {
          const configured = Boolean(getPlanPriceId(plan) && process.env.STRIPE_SECRET_KEY)
          const isSelected = selectedPlanId === plan.id
          const isLoadingThis = loadingPlan === plan.id

          return (
            <div key={plan.id} className={`card !p-5 text-sm ${isSelected ? 'ring-1 ring-[#7C3AED]/60' : ''}`}>
              <div className="font-semibold">{plan.name} — {plan.price}/{plan.cadence}</div>
              <p className="mt-1 text-xs text-[#9CA3AF] line-clamp-2">{plan.blurb}</p>

              <div className="mt-4 space-y-2">
                <button
                  onClick={() => startEmbeddedCheckout(plan.id)}
                  disabled={!configured || isLoadingThis || !!clientSecret}
                  className="w-full rounded bg-[#7C3AED] py-2 text-xs font-medium text-white disabled:opacity-60 hover:bg-[#6D28D9]"
                >
                  {isLoadingThis ? 'Starting secure checkout…' : configured ? 'Subscribe with card (embedded)' : 'Configure Stripe'}
                </button>

                {/* Fallback to existing hosted flow in /api/billing/checkout */}
                <form action="/api/billing/checkout" method="post">
                  <input type="hidden" name="plan" value={plan.id} />
                  <button
                    type="submit"
                    disabled={!configured}
                    className="w-full rounded border border-white/15 py-1.5 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    Or use hosted Stripe checkout →
                  </button>
                </form>
              </div>

              {isSelected && clientSecret && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <EmbeddedSubscriptionForm
                    plan={plan}
                    clientSecret={clientSecret}
                    onSuccess={handleEmbeddedSuccess}
                    onCancel={resetEmbedded}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Embedded uses Stripe Payment Element. Card data never touches our servers. Subscriptions are separate from transaction commissions (Connect + Application Fee on every plan).
      </p>
    </div>
  )
}
