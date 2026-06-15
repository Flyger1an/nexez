'use client'

import type { ReactNode } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { appUrl } from '../../lib/site'
import { FEATURE_LABELS, minPlanForFeature, planAllows, type PlanFeature, type PlanId } from '../../lib/billing'

/**
 * Plan-based feature gate + upgrade teaser. Renders `children` when the viewer's
 * plan unlocks `feature`; otherwise renders a Liquid-Glass locked teaser with an
 * "Upgrade to {Plan}" CTA that deep-links to billing with the plan preselected
 * (auto-starts checkout). Single-sourced on lib/billing's planAllows + minPlanForFeature,
 * so the tier matrix lives in exactly one place.
 *
 * NOTE: this is the upgrade-NUDGE layer (it controls what's shown). True server-side
 * enforcement of each capability lives on the consuming routes/renders — a client gate
 * alone is bypassable.
 */
type PlanGateProps = {
  feature: PlanFeature
  currentPlan: PlanId | null | undefined
  children: ReactNode
  title?: string
  description?: string
  variant?: 'card' | 'tile' | 'inline'
}

function upgradeHref(planId: PlanId) {
  return appUrl(`/dashboard/billing?plan=${planId}`)
}

export function PlanGate({ feature, currentPlan, children, title, description, variant = 'card' }: PlanGateProps) {
  if (planAllows(currentPlan, feature)) return <>{children}</>

  const plan = minPlanForFeature(feature)
  const heading = title ?? FEATURE_LABELS[feature]
  const body = description ?? `Available on the ${plan.name} plan and up — upgrade to unlock.`
  const href = upgradeHref(plan.id)

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] px-4 py-3">
        <Lock className="size-4 shrink-0 text-[var(--signal)]" />
        <span className="min-w-0 flex-1 text-sm text-zinc-300">
          <span className="font-medium text-white">{heading}</span> — {body}
        </span>
        <a href={href} className="btn-primary btn-sm inline-flex shrink-0 items-center gap-1.5">
          <Sparkles className="size-3.5" /> Upgrade to {plan.name}
        </a>
      </div>
    )
  }

  const shell = variant === 'tile' ? 'nx-tile p-6' : 'card !p-8'
  return (
    <div className={`${shell} flex flex-col items-center gap-3 text-center`}>
      <div className="flex size-12 items-center justify-center rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10">
        <Lock className="size-5 text-[var(--signal)]" />
      </div>
      <h3 className="text-xl font-semibold">{heading}</h3>
      <p className="max-w-md text-sm text-zinc-400">{body}</p>
      <a href={href} className="btn-primary mt-1 inline-flex items-center gap-1.5 text-sm">
        <Sparkles className="size-4" /> Upgrade to {plan.name}
      </a>
    </div>
  )
}

/**
 * A lightweight "this is a {Plan} feature" chip — for labelling a control that is
 * shown but gated (or to tease a feature) without replacing it with a full teaser.
 */
export function ProBadge({ feature, className = '' }: { feature: PlanFeature; className?: string }) {
  const plan = minPlanForFeature(feature)
  return (
    <a
      href={upgradeHref(plan.id)}
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--signal)] transition hover:bg-[var(--signal)]/20 ${className}`}
      title={`${FEATURE_LABELS[feature]} — ${plan.name} plan`}
    >
      <Sparkles className="size-3" /> {plan.name}
    </a>
  )
}
