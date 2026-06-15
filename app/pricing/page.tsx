'use client'

import React, { useState } from 'react'
import { Check, Star } from 'lucide-react'
import { billingPlans } from '../../lib/billing'
import { appUrl } from '../../lib/site'

export default function PricingPage() {
  const [selectedPlan, setSelectedPlan] = useState<string>('pro')

  const tiers = [
    ...billingPlans,
    // Add Free explicitly for display if not in list, but we added it
  ]

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="eyebrow justify-center">Plans &amp; pricing</div>
          <h1 className="display mt-4">Simple, transparent pricing.</h1>
          <p className="lede mx-auto mt-4 text-center">
            Subscribe to manage your agent pages. We only take a small platform fee when agents book and pay through your pages.
          </p>
          <div className="mt-4 text-sm" style={{ color: 'var(--ready)' }}>No hidden fees. Cancel anytime.</div>
        </div>

        {/* Main Pricing Tiers */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5 mb-16">
          {tiers.map((plan) => {
            const isPopular = plan.id === 'pro'
            const isFree = plan.id === 'free'
            const isEnterprise = plan.id === 'enterprise'
            const isSelected = selectedPlan === plan.id
            const priceDisplay = isFree ? '$0' : isEnterprise ? 'Custom' : plan.price
            const cadence = isEnterprise ? '' : `/${plan.cadence}`

            return (
              <div
                key={plan.id}
                onClick={() => !isEnterprise && setSelectedPlan(plan.id)}
                style={isSelected ? {
                  borderColor: 'var(--signal)',
                  background: 'color-mix(in srgb, var(--signal) 8%, transparent)',
                } : undefined}
                className={`glass lift relative rounded-3xl p-6 flex flex-col cursor-pointer ${
                  isPopular ? 'prism scale-[1.02]' : ''
                }`}
              >
                {isPopular && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold"
                    style={{ background: 'var(--prism)', color: '#0b0b12' }}
                  >
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-semibold">{plan.name}</h3>
                    {isPopular && <Star className="size-5" style={{ color: 'var(--signal)' }} />}
                  </div>
                  <p className="mt-1 text-sm text-[#9CA3AF]">{plan.blurb}</p>

                  <div className="mt-6">
                    <span className="text-5xl font-semibold tracking-tight">{priceDisplay}</span>
                    <span className="ml-1 text-[#9CA3AF]">{cadence}</span>
                  </div>
                </div>

                <ul className="mt-8 flex-1 space-y-3 text-sm">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--ready)' }} />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {isEnterprise && (
                    <li className="flex items-start gap-2 text-[#9CA3AF]">
                      <Check className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--ready)' }} />
                      <span>Everything in Scale + custom terms</span>
                    </li>
                  )}
                </ul>

                <a
                  href={isFree ? appUrl('/login?mode=signup') : appUrl(`/dashboard/billing?plan=${plan.id}`)}
                  className={`mt-8 w-full ${isPopular ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {isFree ? 'Get started free' : isEnterprise ? 'Contact sales' : 'Choose plan'}
                </a>

                {isFree && <p className="mt-2 text-center text-[10px] text-zinc-500">No credit card required</p>}
              </div>
            )
          })}
        </div>

        {/* Platform Fees Section */}
        <div className="glass prism rounded-3xl p-8 md:p-12">
          <div className="text-center">
            <div className="chip ready mx-auto">We only make money when you do</div>
            <h2 className="display mt-4">Transparent platform fees</h2>
            <p className="lede mx-auto mt-3 text-center">
              Nexez takes a small cut only on successful agent-driven transactions through your pages. No monthly fees on top of your plan.
            </p>
          </div>

          {/* Commission ladder — rendered from the billing catalog (single source
              of truth) so the advertised rate always matches what's actually charged. */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {billingPlans.map((plan) => (
              <div key={plan.id} className="glass rounded-2xl p-5">
                <div className="text-sm font-medium" style={{ color: 'var(--ready)' }}>{plan.name}</div>
                <div className="mt-2 text-3xl font-semibold">{plan.commissionPercent}%</div>
                <p className="mt-2 text-xs text-[#9CA3AF]">
                  {plan.id === 'free'
                    ? 'On every completed booking or payment — no subscription.'
                    : `$100 booking → $${plan.commissionPercent} to Nexez, $${100 - plan.commissionPercent} to you.`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">The transaction fee steps down as your plan goes up — higher tiers keep more of every sale.</p>

          <p className="mt-8 text-center text-xs text-[#9CA3AF]">
            Fees are automatically deducted at payout. Full transparency in your Billing History.
          </p>
        </div>

        {/* Trust & FAQ */}
        <div className="mt-16 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-semibold">Trusted by growing businesses</h3>
            <ul className="mt-4 space-y-2 text-sm text-[#9CA3AF]">
              <li>• Secure payments powered by Stripe</li>
              <li>• 30-day money-back on annual plans</li>
              <li>• Cancel or downgrade anytime</li>
              <li>• No long-term lock-in</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Common questions</h3>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="font-medium">Do I pay if no one books?</div>
                <div className="text-[#9CA3AF]">No. Only transaction fees on successful agent bookings/payments.</div>
              </div>
              <div>
                <div className="font-medium">Can I change plans later?</div>
                <div className="text-[#9CA3AF]">Yes, upgrade or downgrade from your Billing page. Prorated billing.</div>
              </div>
              <div>
                <div className="font-medium">What if I need custom pricing?</div>
                <div className="text-[#9CA3AF]">Enterprise plans are fully customizable. Reach out via support.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <a href={appUrl('/login?mode=signup')} className="btn-primary">
            Start for free
          </a>
          <p className="mt-2 text-xs text-zinc-500">No credit card required for Free tier.</p>
        </div>
      </div>
    </main>
  )
}
