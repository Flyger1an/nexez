'use client'

import { useEffect } from 'react'
import { Bot, Check, Sparkles, X } from 'lucide-react'
import { getBillingPlan, defaultPlan, minPlanForFeature, type PlanId } from '../../lib/billing'
import { upgradeHref, upgradeCta } from './PlanGate'

/**
 * The benefit-led upgrade modal for agentic checkout ("Sell through ChatGPT & Google").
 * Shown when a non-Pro seller acts on the gate — sells ONE benefit: agents can already
 * discover the listing for free; Pro lets them complete the purchase. Copy source:
 * docs/agentic-commerce-upgrade-copy.md. Commission numbers are DERIVED from the
 * billing catalog (viewer's current plan → the unlocking plan), never hardcoded, so a
 * Launch seller sees 8% → 6% while a Free seller sees 15% → 6%.
 *
 * Upgrade-NUDGE layer only (like PlanGate) — real enforcement is server-side in the
 * feed gate + settlement path.
 */
export function AgenticCheckoutUpgradeModal({
  open,
  onClose,
  currentPlan,
}: {
  open: boolean
  onClose: () => void
  currentPlan: PlanId | null | undefined
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const target = minPlanForFeature('agenticCheckout')
  const current = getBillingPlan(currentPlan ?? undefined) ?? defaultPlan()

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agentic-upgrade-title"
        className="glass relative w-full max-w-md rounded-2xl border border-white/10 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
        >
          <X className="size-4" />
        </button>

        <div className="flex size-10 items-center justify-center rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10">
          <Bot className="size-5 text-[var(--signal)]" />
        </div>

        <h2 id="agentic-upgrade-title" className="mt-3 text-lg font-semibold">
          Let agents check out, not just window-shop
        </h2>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Your listing is already discoverable in ChatGPT and Google — agents can find it and quote it today. Upgrade to{' '}
          <span className="font-medium text-[var(--fg)]">{target.name}</span> and they can{' '}
          <span className="font-medium text-[var(--fg)]">complete the purchase</span> right inside the chat: the buyer pays, the
          order lands in your dashboard, and the money settles to your Stripe account.
        </p>

        <ul className="mt-4 space-y-2 text-sm text-[var(--fg-muted)]">
          {[
            'Instant Checkout in ChatGPT + agentic checkout on Google',
            'Paid out through your own Stripe — you’re the merchant of record',
            `${target.commissionPercent}% commission instead of ${current.commissionPercent}%`,
            'Every order tracked, refundable, and reconciled in Nexez',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--ready)' }} />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <a href={upgradeHref(target.id)} className="btn-primary inline-flex items-center gap-1.5 text-sm">
            <Sparkles className="size-4" /> {upgradeCta(target.id, target.name)}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            Keep discovery only
          </button>
        </div>

        <p className="mt-3 text-xs text-[var(--fg-muted)]/80">
          You stay discoverable on {current.name} — upgrading only adds the ability to get paid.
        </p>
      </div>
    </div>
  )
}
