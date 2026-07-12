'use client'

import React from 'react'
import { Check, Star } from 'lucide-react'
import { billingPlans } from '../../lib/billing'
import { appUrl } from '../../lib/site'

export default function PricingPage() {
  // Free is retired - paid plans only, each starting with a 7-day no-card trial.
  // Enterprise routes to sales.
  const tiers = billingPlans.filter((p) => p.id !== 'free')

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="eyebrow justify-center">Plans &amp; pricing</div>
          <h1 className="display mt-4">Simple, transparent pricing.</h1>
          <p className="lede mx-auto mt-4 text-center">
            Start any plan with a 7-day free trial - no credit card required.
          </p>
          <div className="mt-4 text-sm" style={{ color: 'var(--ready)' }}>No hidden fees. Cancel anytime.</div>
        </div>

        {/* Main Pricing Tiers */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-16">
          {tiers.map((plan, planIndex) => {
            const isPopular = plan.id === 'pro'
            const isEnterprise = plan.id === 'enterprise'
            const priceDisplay = isEnterprise ? 'Custom' : plan.price
            const cadence = isEnterprise ? '' : `/${plan.cadence}`
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
                  {isEnterprise ? 'Contact sales' : 'Start free trial'}
                </a>

                {!isEnterprise && <p className="mt-2 text-center text-[10px] text-zinc-500">7-day free trial · no credit card</p>}
              </div>
            )
          })}
        </div>

        {/* Agentic Checkout — the Pro benefit callout. Copy source:
            docs/agentic-commerce-upgrade-copy.md; commission numbers rendered from the
            billing catalog so they can never drift from what's actually charged. */}
        {(() => {
          const launch = billingPlans.find((p) => p.id === 'launch')!
          const pro = billingPlans.find((p) => p.id === 'pro')!
          const rows: { label: string; launch: React.ReactNode; pro: React.ReactNode }[] = [
            { label: 'Listed in ChatGPT & Google agent feeds', launch: <Check className="mx-auto size-4" style={{ color: 'var(--ready)' }} />, pro: <Check className="mx-auto size-4" style={{ color: 'var(--ready)' }} /> },
            { label: 'Agents can complete checkout', launch: <span className="text-zinc-600">—</span>, pro: <Check className="mx-auto size-4" style={{ color: 'var(--ready)' }} /> },
            { label: 'Transaction commission', launch: `${launch.commissionPercent}%`, pro: <span className="font-semibold">{pro.commissionPercent}%</span> },
          ]
          return (
            <div className="glass mb-16 rounded-3xl p-8 md:p-12">
              <div className="grid items-center gap-8 md:grid-cols-2">
                <div>
                  <div className="chip mx-0" style={{ color: 'var(--signal)' }}>New — Agentic Checkout</div>
                  <h2 className="mt-4 text-3xl font-semibold tracking-tight">Turn agent traffic into agent sales.</h2>
                  <p className="mt-3 text-sm text-[#9CA3AF]">
                    Every published listing already shows up when ChatGPT and Google&rsquo;s shopping agents look for what you sell.{' '}
                    <span className="text-white">Pro lets those agents close the sale</span> — buyers check out and pay without ever
                    leaving the chat, settled straight to your Stripe account. You also pay the lowest commission of the core plans:{' '}
                    <span className="text-white">{pro.commissionPercent}%</span>.
                  </p>
                  <p className="mt-3 text-xs italic text-zinc-500">Discovery is free forever. Pro is what makes you buyable.</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-zinc-500">
                      <th className="pb-2 text-left font-medium">&nbsp;</th>
                      <th className="pb-2 text-center font-medium">{launch.name}</th>
                      <th className="pb-2 text-center font-medium" style={{ color: 'var(--signal)' }}>{pro.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label} className="border-t border-white/10">
                        <td className="py-3 pr-3 text-[#9CA3AF]">{row.label}</td>
                        <td className="py-3 text-center">{row.launch}</td>
                        <td className="py-3 text-center">{row.pro}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* Platform Fees Section */}
        <div className="glass prism rounded-3xl p-8 md:p-12">
          <div className="text-center">
            <div className="chip ready mx-auto">We only make money when you do</div>
            <h2 className="display mt-4">Transparent platform fees</h2>
            <p className="lede mx-auto mt-3 text-center">
              Nexez takes a small cut only on successful agent-driven transactions through your listings. No monthly fees on top of your plan.
            </p>
          </div>

          {/* Commission ladder - rendered from the billing catalog (single source
              of truth) so the advertised rate always matches what's actually charged. */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {billingPlans.filter((plan) => plan.id !== 'free').map((plan) => (
              <div key={plan.id} className="glass rounded-2xl p-5">
                <div className="text-sm font-medium" style={{ color: 'var(--ready)' }}>{plan.name}</div>
                <div className="mt-2 text-3xl font-semibold">{plan.commissionPercent}%</div>
                <p className="mt-2 text-xs text-[#9CA3AF]">
                  {`$100 booking → $${plan.commissionPercent} to Nexez, $${100 - plan.commissionPercent} to you.`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">The transaction fee steps down as your plan goes up - higher tiers keep more of every sale.</p>

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
          <a href={appUrl('/onboard?plan=pro')} className="btn-primary">
            Start your free trial
          </a>
          <p className="mt-2 text-xs text-zinc-500">7-day free trial · no credit card required.</p>
        </div>
      </div>
    </main>
  )
}
