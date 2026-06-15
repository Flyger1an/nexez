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

// Enterprise isn't self-serve — its "upgrade" is a sales conversation, not a
// checkout link (a checkout deep-link for Enterprise silently does nothing).
function upgradeHref(planId: PlanId) {
  if (planId === 'enterprise') return appUrl('/support?topic=enterprise')
  return appUrl(`/dashboard/billing?plan=${planId}`)
}
function upgradeCta(planId: PlanId, planName: string) {
  return planId === 'enterprise' ? 'Talk to sales' : `Upgrade to ${planName}`
}
// The default "this lives on plan X" body, shared by the gate teaser and the
// banner so the phrasing stays consistent (callers can still override via
// `description`). `short` is the compact one-liner the banner uses.
function upgradeBody(plan: { id: PlanId; name: string }, opts?: { short?: boolean }) {
  if (plan.id === 'enterprise') {
    return opts?.short
      ? `available on the ${plan.name} plan — talk to our team.`
      : `Available on the ${plan.name} plan — talk to our team to enable it.`
  }
  return opts?.short
    ? `available on the ${plan.name} plan and up.`
    : `Available on the ${plan.name} plan and up — upgrade to unlock.`
}

export function PlanGate({ feature, currentPlan, children, title, description, variant = 'card' }: PlanGateProps) {
  if (planAllows(currentPlan, feature)) return <>{children}</>

  const plan = minPlanForFeature(feature)
  const heading = title ?? FEATURE_LABELS[feature]
  const body = description ?? upgradeBody(plan)
  const href = upgradeHref(plan.id)
  const cta = upgradeCta(plan.id, plan.name)

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] px-4 py-3">
        <Lock className="size-4 shrink-0 text-[var(--signal)]" />
        <span className="min-w-0 flex-1 text-sm text-zinc-300">
          <span className="font-medium text-white">{heading}</span> — {body}
        </span>
        <a href={href} className="btn-primary btn-sm inline-flex shrink-0 items-center gap-1.5">
          <Sparkles className="size-3.5" /> {cta}
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
        <Sparkles className="size-4" /> {cta}
      </a>
    </div>
  )
}

/**
 * A standalone upgrade nudge that renders ONLY when the plan lacks the feature
 * (nothing when it's allowed). Use above a surface that should stay visible/usable
 * but wants to tease the upgrade — e.g. an inbox or catalog page.
 */
export function UpgradeBanner({
  feature,
  currentPlan,
  title,
  description,
  className = '',
}: {
  feature: PlanFeature
  currentPlan: PlanId | null | undefined
  title?: string
  description?: string
  className?: string
}) {
  if (planAllows(currentPlan, feature)) return null
  const plan = minPlanForFeature(feature)
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] px-4 py-3 ${className}`}>
      <Sparkles className="size-4 shrink-0 text-[var(--signal)]" />
      <span className="min-w-0 flex-1 text-sm text-zinc-300">
        <span className="font-medium text-white">{title ?? FEATURE_LABELS[feature]}</span> — {description ?? upgradeBody(plan, { short: true })}
      </span>
      <a href={upgradeHref(plan.id)} className="btn-primary btn-sm inline-flex shrink-0 items-center gap-1.5">
        <Sparkles className="size-3.5" /> {upgradeCta(plan.id, plan.name)}
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
