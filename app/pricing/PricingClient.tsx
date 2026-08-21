'use client'

import React from 'react'
import { Check, Star } from 'lucide-react'
import { billingPlans } from '../../lib/billing'
import { pricingFaqs } from '../../lib/marketing-content'
import { appUrl } from '../../lib/site'

export default function PricingClient() {
  const tiers = billingPlans

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="eyebrow justify-center">Plans &amp; pricing</div>
          <h1 className="display mt-4">Simple, transparent pricing.</h1>
          <p className="lede mx-auto mt-4 text-center">
            Start on Free with no time limit. Verify and publish your business to unlock six complimentary months of Launch access.
          </p>
          <div className="mt-4 text-sm" style={{ color: 'var(--ready)' }}>No card required. No automatic promotional renewal.</div>
        </div>

        {/* Main Pricing Tiers */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5 mb-16">
          {tiers.map((plan, planIndex) => {
            const isPopular = plan.id === 'pro'
            const isEnterprise = plan.id === 'enterprise'
            const priceDisplay = isEnterprise ? 'Custom' : plan.price
            const cadence = isEnterprise ? '' : `/${plan.cadence}`
            const commissionLabel = isEnterprise ? 'Typically 1–2%' : `${plan.commissionPercent}%`
            // Plans are cumulative - make that legible (each builds on the one before).
            const previousPlanName = !isEnterprise && planIndex > 0 ? tiers[planIndex - 1].name : null

            return (
              <div
                key={plan.id}
                style={isPopular ? {
                  borderColor: 'var(--signal)',
                  background: 'color-mix(in srgb, var(--signal) 8%, transparent)',
                } : undefined}
                className={`glass lift relative rounded-3xl p-6 flex flex-col ${
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
                  <div className="mt-2 text-sm text-[#9CA3AF]">
                    <span className="font-medium text-white">{commissionLabel}</span> Nexez commission
                  </div>
                </div>

                <ul className="mt-8 flex-1 space-y-3 text-sm">
                  {previousPlanName && (
                    <li className="flex items-start gap-2 font-medium text-white">
                      <Check className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--ready)' }} />
                      <span>Everything in {previousPlanName}, plus:</span>
                    </li>
                  )}
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
                  href={isEnterprise ? '/support' : appUrl(`/onboard?plan=${plan.id}`)}
                  className={`mt-8 w-full ${isPopular ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {isEnterprise ? 'Contact sales' : plan.id === 'free' ? 'Start Free' : 'Start 7-day trial'}
                </a>

                {!isEnterprise && (
                  <p className="mt-2 text-center text-[10px] text-zinc-500">
                    {plan.id === 'free' ? 'No expiry · no card required' : '7-day trial · no credit card'}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="glass mb-16 rounded-3xl p-8 md:p-12">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <div className="chip mx-0" style={{ color: 'var(--signal)' }}>Agent-ready checkout on every plan</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Start selling before you subscribe.</h2>
              <p className="mt-3 text-sm text-[#9CA3AF]">
                Every commerce-ready merchant can be discovered and complete Nexez-settled transactions. Paid plans add operating
                leverage, higher limits, and lower platform fees as your agent-commerce volume grows.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-6">
              <div className="text-lg font-semibold">Start free.</div>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Nexez earns <span className="font-medium text-white">9% only when a transaction is completed through Nexez.</span>
              </p>
              <ul className="mt-5 space-y-3 text-sm text-[#9CA3AF]">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" /> Discovery and checkout are available on Free</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" /> Upgrade for tools, scale, and better economics</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Platform Fees Section */}
        <div className="glass prism rounded-3xl p-8 md:p-12">
          <div className="text-center">
            <div className="chip ready mx-auto">We only make money when you do</div>
            <h2 className="display mt-4">Transparent platform fees</h2>
            <p className="lede mx-auto mt-3 text-center">
              Lower platform fees as your agent-commerce volume grows.
            </p>
          </div>

          {/* Commission ladder - rendered from the billing catalog (single source
              of truth) so the advertised rate always matches what's actually charged. */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {billingPlans.map((plan) => (
              <div key={plan.id} className="glass rounded-2xl p-5">
                <div className="text-sm font-medium" style={{ color: 'var(--ready)' }}>{plan.name}</div>
                <div className="mt-2 text-3xl font-semibold">{plan.id === 'enterprise' ? '1–2%' : `${plan.commissionPercent}%`}</div>
                <p className="mt-2 text-xs text-[#9CA3AF]">
                  {plan.id === 'enterprise'
                    ? 'Custom commercial terms based on volume and requirements.'
                    : `$100 Nexez-settled sale → $${plan.commissionPercent} to Nexez, $${100 - plan.commissionPercent} before payment processing.`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">The transaction fee steps down as your plan goes up - higher tiers keep more of every sale.</p>

          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-[#9CA3AF]">
            Nexez&rsquo;s platform commission applies to transactions settled through Nexez. Card and payment-processing fees are separate.
            External provider handoffs are not charged a Nexez transaction commission unless separately agreed.
          </p>
        </div>

        {/* Trust & FAQ */}
        <div className="mt-16 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-semibold">Trusted by growing businesses</h3>
            <ul className="mt-4 space-y-2 text-sm text-[#9CA3AF]">
              <li>• Secure payments powered by Stripe</li>
              <li>• Free plan with no time limit</li>
              <li>• Cancel or downgrade anytime</li>
              <li>• Promotional Launch access never auto-charges</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Common questions</h3>
            <div className="mt-4 space-y-4 text-sm">
              {pricingFaqs.map((faq) => (
                <div key={faq.question}>
                  <div className="font-medium">{faq.question}</div>
                  <div className="text-[#9CA3AF]">{faq.answer}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <a href={appUrl('/onboard?plan=free')} className="btn-primary">
            Start Free
          </a>
          <p className="mt-2 text-xs text-zinc-500">Publish and verify to activate six complimentary months of Launch.</p>
        </div>
      </div>
    </main>
  )
}
