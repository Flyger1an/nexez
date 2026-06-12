'use client'

import React, { useState, useEffect } from 'react'
import EmbeddedSubscriptionForm from './EmbeddedSubscriptionForm'
import { billingPlans, getPlanPriceId } from '../../lib/billing'

/**
 * Client component for plan selection + Embedded Subscription checkout (Stripe Elements).
 * Primary recurring sub flow for paid plans.
 *
 * See app/api/billing/create-subscription/route.ts for the server counterpart.
 */

interface EmbeddedPlanSelectorProps {
  activePlanId: string
  stripeReady: boolean
  initialPlanId?: string | null
}

export default function EmbeddedPlanSelector({ activePlanId, stripeReady, initialPlanId }: EmbeddedPlanSelectorProps) {
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
    <div id="plans" className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Choose a plan</h2>
          <p className="text-sm text-[#9CA3AF] mt-0.5">Switch anytime. Billed monthly. Cancel anytime via Stripe portal.</p>
        </div>
        <a href="/pricing" className="text-sm text-[#7C3AED] hover:underline">View full comparison →</a>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-xl border border-[var(--ready)]/30 bg-[var(--ready)]/10 p-4 text-sm text-[var(--ready)]">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredPlans.map((plan) => {
          const priceId = getPlanPriceId(plan)
          const hasPriceForPlan = Boolean(priceId)
          const canUseEmbedded = stripeReady
          const isSelected = selectedPlanId === plan.id
          const isLoadingThis = loadingPlan === plan.id

          return (
            <div 
              key={plan.id} 
              className={`group relative rounded-2xl border p-6 transition-all ${isSelected ? 'border-[#7C3AED] bg-[#1A1625] ring-1 ring-[#7C3AED]/30' : 'border-white/10 bg-[#12101B] hover:border-white/20'}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-semibold tracking-tight">{plan.name}</div>
                  {plan.id === 'pro' && <span className="rounded-full bg-[#7C3AED] px-2.5 py-0.5 text-[10px] font-medium tracking-wider text-white">POPULAR</span>}
                </div>
                <div className="mt-1 text-sm text-[#9CA3AF]">{plan.blurb}</div>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tighter">{plan.price}</span>
                  <span className="text-[#9CA3AF] text-sm">/{plan.cadence}</span>
                </div>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-[#9CA3AF]">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 inline-block size-1.5 rounded-full bg-[var(--ready)]/70" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 space-y-2">
                <button
                  onClick={() => startEmbeddedCheckout(plan.id)}
                  disabled={!canUseEmbedded || isLoadingThis || !!clientSecret}
                  className="w-full rounded-xl bg-[#7C3AED] py-3 text-sm font-semibold text-white transition hover:bg-[#6D28D9] disabled:opacity-60 active:bg-[#5B21B6]"
                >
                  {isLoadingThis ? 'Starting secure checkout…' : canUseEmbedded ? 'Subscribe with card' : 'Configure Stripe'}
                </button>

                <form action="/api/billing/checkout" method="post">
                  <input type="hidden" name="plan" value={plan.id} />
                  <button
                    type="submit"
                    disabled={!hasPriceForPlan}
                    className="w-full rounded-xl border border-white/15 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    Or use hosted Stripe checkout
                  </button>
                </form>
              </div>

              {isSelected && clientSecret && (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="mb-3 text-xs uppercase tracking-[1px] text-[#9CA3AF]">Complete payment</div>
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

      <p className="mt-4 text-center text-[10px] text-zinc-500">
        Subscriptions billed via Stripe. Transaction commissions (on every plan, including Free) are handled separately via your connected Stripe account.
      </p>
    </div>
  )
}
