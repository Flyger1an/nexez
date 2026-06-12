'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Rocket, X } from 'lucide-react'
import { AgentPage } from '../lib/agent-page'
import { getOnboardingSteps, onboardingProgress } from '../lib/onboarding'

const DISMISS_KEY = 'nexez_onboarding_dismissed'

export function OnboardingChecklist({ pages }: { pages: AgentPage[] }) {
  const [dismissed, setDismissed] = useState(true) // default hidden until we read localStorage (avoids flash)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  const steps = getOnboardingSteps(pages)
  const progress = onboardingProgress(steps)

  // Hide once complete (and clear the flag so it can resurface if state changes) or if dismissed.
  if (progress.complete || dismissed) return null

  return (
    <section className="mb-6 rounded-2xl border border-[#7C3AED]/30 bg-gradient-to-br from-[var(--signal)]/10 to-[var(--ready)]/5 p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Rocket className="size-5 text-[#C4B5FD]" />
          <h2 className="text-lg font-semibold">Get set up</h2>
          <span className="text-xs text-zinc-400">
            {progress.done}/{progress.total} done
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1')
            setDismissed(true)
          }}
          className="text-zinc-400 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--signal)] to-[var(--ready)] transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
              step.done ? 'border-emerald-300/20 bg-emerald-300/5' : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-zinc-500" />
              )}
              <div className="min-w-0">
                <p className={`text-sm ${step.done ? 'text-zinc-400 line-through' : 'text-zinc-100'}`}>
                  {step.title}
                </p>
                {!step.done && <p className="mt-0.5 text-xs text-zinc-500">{step.description}</p>}
              </div>
            </div>
            {!step.done && (
              <a
                href={step.href}
                className="shrink-0 rounded-lg border border-[#7C3AED]/40 bg-[#7C3AED]/10 px-3 py-1 text-xs text-[#C4B5FD] hover:bg-[#7C3AED]/20"
              >
                {step.cta}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
