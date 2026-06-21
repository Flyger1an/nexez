'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ArrowRight, CreditCard, User, Sparkles } from 'lucide-react'
import { createClient } from '../../utils/supabase/client'
import { billingPlans } from '../../lib/billing'

type Step = 1 | 2 | 3 | 4

export default function OnboardPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [selectedPlanId, setSelectedPlanId] = useState('pro')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false)

  // Only Launch/Pro/Scale are self-serve (Free is gone; Enterprise = contact sales).
  const trialablePlans = billingPlans.filter((p) => p.id !== 'free' && p.id !== 'enterprise')
  const selectedPlan = billingPlans.find(p => p.id === selectedPlanId) || trialablePlans[0]
  // No-card 7-day trial: a freshly-onboarded user lands on the dashboard with their trial
  // already live — no immediate checkout. They add a card any time before day 7 to stay live.
  const postSignupPath = '/dashboard'

  useEffect(() => {
    const planParam = new URLSearchParams(window.location.search).get('plan')
    if (planParam && trialablePlans.some((p) => p.id === planParam)) setSelectedPlanId(planParam)
    // Already signed in (e.g. arriving from pricing "Start trial")? Skip the wizard → dashboard.
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) router.replace('/dashboard')
      })
  }, [])

  const steps = [
    { num: 1, title: 'Choose Your Plan' },
    { num: 2, title: 'Create Your Account' },
    { num: 3, title: 'Connect Stripe' },
    { num: 4, title: "You're All Set" },
  ]

  async function handleSignupAndContinue() {
    setLoading(true)
    setError('')
    const supabase = createClient()

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, company, plan: selectedPlanId },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(postSignupPath)}`,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // When email confirmation is required there is NO session yet, so we can't
    // proceed to Stripe Connect (which needs an authenticated request). Show a
    // "check your email" state; the confirmation link resumes via
    // /auth/callback?next=postSignupPath (checkout for paid, dashboard for free).
    if (!data.session) {
      setNeedsEmailConfirm(true)
      setLoading(false)
      return
    }

    // Session is live → start the 7-day no-card trial of the chosen plan. Idempotent +
    // service-role; if email confirmation had been required, the dashboard seeds it instead.
    await fetch('/api/billing/start-trial', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: selectedPlanId }),
    }).catch(() => {})

    setStep(3)
    setLoading(false)
  }

  async function handleStripeConnect() {
    setLoading(true)
    try {
      // Create Stripe Connect account + get onboarding link (Express for quick setup).
      // This is for transaction payments (owner MoR + Nexez app fee/commission on all plans incl Free).
      // Subscriptions (Nexez billing to owner) are handled separately in Billing.
      const res = await fetch('/api/billing/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Carry the chosen paid plan so payouts onboarding returns to checkout for it.
        body: JSON.stringify({ plan: selectedPlanId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url // redirect to Stripe hosted onboarding
      } else {
        setError(data.error || 'Failed to start Stripe Connect onboarding.')
        setLoading(false)
      }
    } catch (e: any) {
      setError(e.message || 'Connect error')
      setLoading(false)
    }
  }

  function finishOnboarding() {
    router.push(postSignupPath)
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--signal-solid)] text-sm font-semibold">N</div>
          <div>
            <div className="font-semibold tracking-tight">Nexez</div>
            <div className="text-[10px] text-[#9CA3AF] -mt-1">Onboarding</div>
          </div>
        </div>

        <div className="grid md:grid-cols-12 gap-8">
          {/* Stepper */}
          <div className="md:col-span-4">
            <div className="sticky top-8">
              <div className="text-xs uppercase tracking-[2px] text-[#9CA3AF] mb-3">4-STEP ONBOARDING</div>
              <ol className="space-y-3">
                {steps.map((s) => (
                  <li key={s.num} className={`flex gap-3 text-sm ${step === s.num ? 'text-white' : 'text-[#9CA3AF]'}`}>
                    <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${step >= s.num ? 'border-[var(--signal)] bg-[var(--signal)]/10 text-[var(--signal)]' : 'border-white/20'}`}>
                      {step > s.num ? <Check className="size-3" /> : s.num}
                    </div>
                    <div>
                      <div className="font-medium">{s.title}</div>
                      {s.num === 3 && <div className="text-[10px] text-[var(--ready)]">Required to accept card payments</div>}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-xs text-[#9CA3AF]">You can always change your plan later from Billing.</p>
            </div>
          </div>

          {/* Content */}
          <div className="md:col-span-8">
            {step === 1 && (
              <div>
                <h1 className="text-4xl font-semibold tracking-tight">Start your free trial</h1>
                <p className="mt-2 text-[#9CA3AF]">Pick a plan to begin your 7-day free trial — no credit card required. Add one any time before it ends to stay live.</p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {trialablePlans.map(plan => {
                    const isSelected = selectedPlanId === plan.id
                    const isPopular = plan.id === 'pro'
                    return (
                      <button
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`text-left rounded-2xl border p-5 transition ${isSelected ? 'border-[var(--signal)] bg-[#1A1625]' : 'border-white/10 hover:border-white/20'}`}
                      >
                        <div className="flex justify-between">
                          <div>
                            <div className="font-semibold text-lg">{plan.name}</div>
                            <div className="text-sm text-[#9CA3AF]">{plan.blurb}</div>
                          </div>
                          {isPopular && <span className="rounded bg-[var(--signal)] px-2 py-0.5 text-[10px] font-semibold text-zinc-950 h-fit">Popular</span>}
                        </div>
                        <div className="mt-4">
                          <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                          {plan.cadence && <span className="text-sm text-[#9CA3AF]">/{plan.cadence}</span>}
                        </div>
                        <ul className="mt-4 text-xs text-[#9CA3AF] space-y-1">
                          {plan.features.slice(0, 3).map((f, i) => <li key={i}>• {f}</li>)}
                        </ul>
                      </button>
                    )
                  })}
                </div>

                <a href="/pricing" className="mt-4 inline-block text-sm text-[#9CA3AF] hover:text-white underline">Compare all plans and platform fees</a>

                <button onClick={() => setStep(2)} className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-medium text-zinc-950 hover:bg-zinc-200">
                  Start {selectedPlan.name} trial <ArrowRight className="size-4" />
                </button>
                <p className="mt-2 text-xs text-[#9CA3AF]">No card required to start. Upgrade or downgrade anytime from Billing.</p>
              </div>
            )}

            {step === 2 && needsEmailConfirm && (
              <div>
                <h1 className="text-4xl font-semibold tracking-tight">Confirm your email</h1>
                <p className="mt-2 max-w-md text-[#9CA3AF]">
                  We sent a confirmation link to <span className="text-white">{email}</span>. Click it to
                  activate your account and start your 7-day {selectedPlan.name} trial.
                </p>
                <div className="mt-8 max-w-md rounded-2xl border border-white/10 bg-[#12101B] p-6 text-sm text-[#9CA3AF]">
                  <div className="flex items-center gap-3 text-white">
                    <Check className="size-5 text-[var(--ready)]" />
                    <span className="font-medium">Account created</span>
                  </div>
                  <p className="mt-3">
                    Didn’t get the email? Check spam, or{' '}
                    <button onClick={() => { setNeedsEmailConfirm(false); }} className="text-[var(--signal)] underline">
                      go back
                    </button>{' '}
                    to re-enter your details.
                  </p>
                </div>
              </div>
            )}

            {step === 2 && !needsEmailConfirm && (
              <div>
                <h1 className="text-4xl font-semibold tracking-tight">Create your account</h1>
                <p className="mt-1 text-[#9CA3AF]">You're signing up for the {selectedPlan.name} plan.</p>

                <div className="mt-8 max-w-md space-y-4">
                  <input type="text" placeholder="Full name" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm" />
                  <input type="text" placeholder="Business or company name" value={company} onChange={e => setCompany(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm" />
                  <input type="email" placeholder="Work email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm" />
                  <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm" />

                  {error && <p className="text-sm text-red-400">{error}</p>}

                  <button 
                    onClick={handleSignupAndContinue} 
                    disabled={loading || !email || !password || !fullName || !company}
                    className="w-full rounded-lg bg-[var(--signal-solid)] py-3 font-medium disabled:opacity-60"
                  >
                    {loading ? 'Creating account…' : 'Create account & continue'}
                  </button>
                  <p className="text-center text-xs text-[#9CA3AF]">By continuing you agree to our Terms and Privacy Policy.</p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h1 className="text-4xl font-semibold tracking-tight">Connect Stripe</h1>
                <p className="mt-2 max-w-md text-[#9CA3AF]">
                  Link your Stripe account so agents can pay you directly for bookings and offers.
                  <span className="text-[var(--ready)]"> Required to accept card payments on Nexez</span> — without it,
                  agents are routed to your external booking links instead.
                </p>

                <div className="mt-8 max-w-md rounded-2xl border border-white/10 bg-[#12101B] p-6">
                  <div className="flex items-center gap-3 text-sm">
                    <CreditCard className="size-5 text-[var(--signal)]" />
                    <div>
                      <div className="font-medium">Secure Stripe Connect</div>
                      <div className="text-xs text-[#9CA3AF]">Nexez never sees your customer payment details.</div>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button 
                      onClick={handleStripeConnect}
                      disabled={loading}
                      className="flex-1 rounded-lg bg-white py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
                    >
                      {loading ? 'Connecting…' : 'Connect with Stripe'}
                    </button>
                    <button onClick={() => setStep(4)} className="flex-1 rounded-lg border border-white/15 py-3 text-sm hover:bg-white/5">
                      Skip for now
                    </button>
                  </div>
                  <p className="mt-3 text-[10px] text-center text-[#9CA3AF]">You can connect later from Billing or Integrations.</p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="text-center">
                <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-[var(--ready)] text-4xl">🎉</div>
                <h1 className="text-4xl font-semibold tracking-tight">Your trial is live</h1>
                <p className="mt-3 text-[#9CA3AF]">
                  Your 7-day {selectedPlan.name} trial just started — no card required. Add a payment method any time before it ends to keep your storefront live.
                </p>

                <div className="mt-8 inline-block rounded-2xl border border-white/10 bg-[#12101B] p-6 text-left text-sm">
                  <div className="font-medium">Summary</div>
                  <div className="mt-2 space-y-1 text-[#9CA3AF]">
                    <div>• Plan: {selectedPlan.name} — 7-day free trial ({selectedPlan.price}/{selectedPlan.cadence} after)</div>
                    <div>• Stripe payouts: connect anytime from Billing or Integrations</div>
                    <div>• Next: Create your first listing</div>
                  </div>
                </div>

                <div className="mt-8 flex justify-center gap-3">
                  <button onClick={finishOnboarding} className="rounded-lg bg-white px-8 py-3 font-medium text-zinc-950 hover:bg-zinc-200">
                    Go to Dashboard
                  </button>
                  <a href="/create" className="rounded-lg border border-white/15 px-8 py-3 hover:bg-white/5">Create your first listing</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
