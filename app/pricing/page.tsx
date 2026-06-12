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
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-semibold tracking-tighter">Simple, transparent pricing.</h1>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-[#9CA3AF]">
            Subscribe to manage your agent pages. We only take a small platform fee when agents book and pay through your pages.
          </p>
          <div className="mt-4 text-sm text-emerald-400">No hidden fees. Cancel anytime.</div>
        </div>

        {/* Main Pricing Tiers */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5 mb-16">
          {tiers.map((plan, index) => {
            const isPopular = plan.id === 'pro'
            const isFree = plan.id === 'free'
            const isEnterprise = plan.id === 'enterprise'
            const priceDisplay = isFree ? '$0' : isEnterprise ? 'Custom' : plan.price
            const cadence = isEnterprise ? '' : `/${plan.cadence}`

            return (
              <div
                key={plan.id}
                onClick={() => !isEnterprise && setSelectedPlan(plan.id)}
                className={`relative rounded-3xl border p-6 flex flex-col transition-all cursor-pointer ${
                  selectedPlan === plan.id
                    ? 'border-[#7C3AED] bg-[#1A1625] ring-1 ring-[#7C3AED]/30'
                    : 'border-white/10 bg-[#12101B] hover:border-white/20'
                } ${isPopular ? 'scale-[1.02] shadow-xl' : ''}`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#7C3AED] px-3 py-0.5 text-xs font-semibold">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-semibold">{plan.name}</h3>
                    {isPopular && <Star className="size-5 text-[#C4B5FD]" />}
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
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {isEnterprise && (
                    <li className="flex items-start gap-2 text-[#9CA3AF]">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                      <span>Everything in Scale + custom terms</span>
                    </li>
                  )}
                </ul>

                <a
                  href={isFree ? appUrl('/login?mode=signup') : appUrl(`/dashboard/billing?plan=${plan.id}`)}
                  className={`mt-8 block w-full rounded-lg py-3 text-center text-sm font-semibold transition ${
                    isPopular
                      ? 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]'
                      : isEnterprise
                      ? 'border border-white/20 text-white hover:bg-white/5'
                      : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {isFree ? 'Get started free' : isEnterprise ? 'Contact sales' : 'Choose plan'}
                </a>

                {isFree && <p className="mt-2 text-center text-[10px] text-zinc-500">No credit card required</p>}
              </div>
            )
          })}
        </div>

        {/* Platform Fees Section */}
        <div className="rounded-3xl border border-white/10 bg-[#12101B] p-8 md:p-12">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-1 text-sm text-emerald-300">
              We only make money when you do
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Transparent platform fees</h2>
            <p className="mt-3 max-w-md mx-auto text-[#9CA3AF]">
              Nexez takes a small cut only on successful agent-driven transactions through your pages. No monthly fees on top of your plan.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 p-6">
              <div className="text-sm font-medium text-emerald-300">Free / Launch</div>
              <div className="mt-2 text-4xl font-semibold">15%</div>
              <p className="mt-2 text-sm text-[#9CA3AF]">Platform fee on every completed booking or payment.</p>
              <div className="mt-4 text-xs text-zinc-500">Example: $100 booking → $15 to Nexez, $85 to you.</div>
            </div>
            <div className="rounded-2xl border border-white/10 p-6">
              <div className="text-sm font-medium text-emerald-300">Pro</div>
              <div className="mt-2 text-4xl font-semibold">10%</div>
              <p className="mt-2 text-sm text-[#9CA3AF]">Lower rate as you scale. Includes priority support for payments.</p>
              <div className="mt-4 text-xs text-zinc-500">Example: $100 booking → $10 to Nexez, $90 to you.</div>
            </div>
            <div className="rounded-2xl border border-white/10 p-6">
              <div className="text-sm font-medium text-emerald-300">Scale / Enterprise</div>
              <div className="mt-2 text-4xl font-semibold">6% — 8%</div>
              <p className="mt-2 text-sm text-[#9CA3AF]">Volume-based. Custom rates available for Enterprise.</p>
              <div className="mt-4 text-xs text-zinc-500">Negotiated per agreement. Contact sales for details.</div>
            </div>
          </div>

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
          <a href={appUrl('/login?mode=signup')} className="inline-flex items-center gap-2 rounded-lg bg-white px-8 py-3 font-medium text-zinc-950 hover:bg-zinc-200">
            Start for free
          </a>
          <p className="mt-2 text-xs text-zinc-500">No credit card required for Free tier.</p>
        </div>
      </div>
    </main>
  )
}
