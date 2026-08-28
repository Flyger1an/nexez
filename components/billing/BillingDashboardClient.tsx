'use client'

/**
 * BillingDashboardClient
 *
 * Premium glassmorphic tabbed billing experience.
 * - Tabs: Overview | Usage | Billing History | Platform Fees | Plans & Pricing
 * - Integrates real server-fetched data (active plan, usage, billingState for Connect)
 * - Uses existing EmbeddedSubscriptionForm for inline Stripe Payment Element (glass panel)
 * - Reuses StripeConnectButton / RefreshConnectButton for the dual-revenue payouts flow
 * - Fully responsive, accessible, generous whitespace, modern typography
 * - Subtle hovers, transitions, glass (backdrop-blur + transparent borders + soft shadows)
 *
 * Design strictly follows the spec:
 * - Glassmorphism throughout cards/panels/tab container
 * - Current Plan hero in Overview
 * - Usage grids with progress (bars + rings)
 * - Sortable Billing History table with placeholder invoices
 * - Platform Fees + full Connect account management
 * - Beautiful plan comparison cards; selecting a paid plan reveals inline glass checkout panel
 */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CreditCard,
  BarChart3,
  History,
  Percent,
  Sparkles,
  ArrowUp,
  Download,
  Calendar,
  Check,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'

import EmbeddedSubscriptionForm from './EmbeddedSubscriptionForm'
import StripeConnectButton from './StripeConnectButton'
import RefreshConnectButton from './RefreshConnectButton'
import { GlassCard, ProgressRing, SectionHeader } from './billing-ui'

import type { BillingPlan } from '../../lib/billing'
import type { BillingSubscription } from '../../lib/stripe-billing'
import { billingStatusCopy } from '../../lib/stripe-billing'
import { billingPlans } from '../../lib/billing'
import { formatCurrencyAmount } from '../../lib/currency'
import type { PromotionalPlanGrant } from '../../lib/server/plan'
import { getPlanEconomics, monthlyNexezCost, planBreakevenGmv, type PlanEconomics } from '../../lib/plan-economics'

// Tab definition (order matches user spec)
const TABS = [
  { id: 'overview', label: 'Overview', icon: CreditCard },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'history', label: 'Billing History', icon: History },
  { id: 'fees', label: 'Platform Fees', icon: Percent },
  { id: 'plans', label: 'Plans & Pricing', icon: Sparkles },
] as const

type TabId = (typeof TABS)[number]['id']

interface UsageMetric {
  label: string
  current: number
  // null = a real running count with no plan cap (rendered as a plain number, not "x / y").
  limit: number | null
  unit?: string
}

interface Invoice {
  id: string
  date: string
  description: string
  amount: number
  status: 'paid' | 'pending' | 'failed'
  hostedUrl?: string | null
}

interface BillingDashboardClientProps {
  activePlan: BillingPlan | undefined
  billingState: BillingSubscription | null
  // Pages are metered against the plan limit; the rest are real this-month counts.
  usage: {
    pages: UsageMetric
    offers: UsageMetric
    aiOptimizations: UsageMetric
    simulations: UsageMetric
    impressions: UsageMetric
  }
  // Real Stripe invoices (empty when none / not configured) + real platform fee this month.
  invoices: Invoice[]
  platformFeesCents: number
  agentRevenueCents?: number
  revenueCurrency?: string
  commissionPct?: number
  commissionBps?: number
  commissionSource?: 'plan_default' | 'enterprise_override' | 'promotion'
  monthlySubscriptionCents?: number | null
  processorFeesCents?: number | null
  stripeReady: boolean
  configuredPlanIds: string[]
  initialPlanId?: string | null
  connectSuccess?: boolean
  hasEnterpriseOverride?: boolean
  promotion?: PromotionalPlanGrant | null
  fallbackPages?: Array<{ id: string; name: string }>
}

export default function BillingDashboardClient({
  activePlan,
  billingState,
  usage,
  invoices: invoicesProp,
  platformFeesCents,
  agentRevenueCents = 0,
  revenueCurrency = 'usd',
  commissionPct = 9,
  commissionBps = 900,
  commissionSource = 'plan_default',
  monthlySubscriptionCents = 0,
  processorFeesCents = null,
  stripeReady,
  configuredPlanIds,
  initialPlanId,
  connectSuccess,
  hasEnterpriseOverride = false,
  promotion = null,
  fallbackPages = [],
}: BillingDashboardClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // Embedded checkout state (Plans tab)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null)
  const [fallbackPageId, setFallbackPageId] = useState(promotion?.fallbackPageId ?? fallbackPages[0]?.id ?? '')
  const [fallbackSaving, setFallbackSaving] = useState(false)
  const [fallbackFeedback, setFallbackFeedback] = useState<string | null>(null)

  // Real Stripe invoices passed from the server (empty when none / Stripe not configured).
  const invoices = invoicesProp
  const [sortKey, setSortKey] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const currentEconomics: PlanEconomics | null = monthlySubscriptionCents == null
    ? null
    : { subscriptionCents: monthlySubscriptionCents, commissionBps }
  const nextPlan = activePlan
    ? billingPlans.find((plan) => plan.rank > activePlan.rank && plan.monthlyPriceCents != null)
    : billingPlans.find((plan) => plan.id === 'launch')
  const nextEconomics = nextPlan ? getPlanEconomics(nextPlan.id) : null
  const currentMonthlyNexezCost = currentEconomics
    ? monthlyNexezCost(agentRevenueCents, currentEconomics)
    : null
  const nextMonthlyNexezCost = nextEconomics
    ? monthlyNexezCost(agentRevenueCents, nextEconomics)
    : null
  const nextTierSavingsCents =
    currentMonthlyNexezCost != null && nextMonthlyNexezCost != null
      ? currentMonthlyNexezCost - nextMonthlyNexezCost
      : 0
  const nextTierBreakevenCents = currentEconomics && nextEconomics
    ? planBreakevenGmv(currentEconomics, nextEconomics)
    : null

  // Auto-open Plans tab + start checkout when linked with ?plan= from pricing or elsewhere
  useEffect(() => {
    if (initialPlanId && initialPlanId !== activePlan?.id) {
      const plan = billingPlans.find((p) => p.id === initialPlanId)
      if (plan && plan.id !== 'free' && plan.id !== 'enterprise') {
        setActiveTab('plans')
        // slight delay so tab is visible
        setTimeout(() => {
          startEmbeddedCheckout(initialPlanId)
        }, 120)
      }
    }
  }, [initialPlanId])

  // If we just returned from Connect success, surface the fees tab
  useEffect(() => {
    if (connectSuccess) {
      setActiveTab('fees')
    }
  }, [connectSuccess])

  // ========== EMBEDDED CHECKOUT (reuses /api/billing/create-subscription + EmbeddedSubscriptionForm) ==========
  async function startEmbeddedCheckout(planId: string) {
    const plan = billingPlans.find((p) => p.id === planId)
    if (!plan || plan.id === 'free' || plan.id === 'enterprise') return

    if (!stripeReady) {
      setCheckoutError('Stripe is not fully configured yet. Add your Stripe keys to enable subscriptions.')
      return
    }
    if (!configuredPlanIds.includes(planId)) {
      setSelectedPlanId(planId)
      setCheckoutError(`${plan.name} checkout is not ready yet. Add this plan's Stripe Price ID and redeploy.`)
      return
    }

    setCheckoutLoading(planId)
    setCheckoutError(null)
    setCheckoutSuccess(null)
    setSelectedPlanId(planId)
    setClientSecret(null)

    try {
      const res = await fetch('/api/billing/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      })
      const data = await res.json()

      // Existing live subscription: the server switched its price in place (prorated) -
      // there is no new payment to confirm, so no PaymentElement mounts.
      if (res.ok && data.planChanged) {
        setSelectedPlanId(null)
        setCheckoutSuccess(`You're switched to ${plan.name}. Prorated charges or credit apply to your next invoice. This page will refresh shortly.`)
        setTimeout(() => {
          router.refresh()
          setTimeout(() => window.location.reload(), 900)
        }, 1400)
        return
      }
      if (res.ok && data.alreadyOnPlan) {
        setSelectedPlanId(null)
        setCheckoutSuccess(`You're already subscribed to ${plan.name}.`)
        return
      }

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || 'Failed to start secure checkout.')
      }
      setClientSecret(data.clientSecret)
      setActiveTab('plans') // ensure we are on the plans tab
    } catch (e: any) {
      console.error('[BillingClient] create-subscription error', e)
      setCheckoutError(e.message || 'Could not initialize payment. Please try again or use the hosted checkout.')
      setSelectedPlanId(null)
    } finally {
      setCheckoutLoading(null)
    }
  }

  function resetCheckout() {
    setClientSecret(null)
    setSelectedPlanId(null)
    setCheckoutError(null)
    setCheckoutSuccess(null)
  }

  function handleEmbeddedSuccess() {
    const plan = billingPlans.find((p) => p.id === selectedPlanId)
    setCheckoutSuccess(`Thank you! Your ${plan?.name || 'new'} subscription is being activated. This page will refresh shortly.`)
    setClientSecret(null)
    setSelectedPlanId(null)

    // Give webhook a moment, then hard refresh so server data (activePlan, status) is fresh
    setTimeout(() => {
      router.refresh()
      // Fallback full reload in case RSC data is cached
      setTimeout(() => window.location.reload(), 900)
    }, 1400)
  }

  // ========== BILLING HISTORY SORT ==========
  const sortedInvoices = [...invoices].sort((a, b) => {
    if (sortKey === 'date') {
      return sortDir === 'desc'
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date)
    }
    return sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount
  })

  function toggleSort(key: 'date' | 'amount') {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'desc')
    }
  }

  function handleInvoiceDownload(inv: Invoice) {
    // Open the real Stripe-hosted invoice when we have its URL; otherwise fall back
    // to the customer portal (the source of truth for all invoices).
    if (inv.hostedUrl) {
      window.open(inv.hostedUrl, '_blank', 'noopener,noreferrer')
      return
    }
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/billing/portal'
    form.target = '_blank'
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  async function saveFallbackPage(pageId: string) {
    if (!pageId || fallbackSaving) return
    const previousPageId = fallbackPageId
    setFallbackPageId(pageId)
    setFallbackSaving(true)
    setFallbackFeedback(null)
    try {
      const response = await fetch('/api/billing/promotion/fallback-page', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageId }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) setFallbackPageId(previousPageId)
      setFallbackFeedback(response.ok ? 'Fallback listing saved.' : body.error || 'Could not save this listing.')
    } catch {
      setFallbackPageId(previousPageId)
      setFallbackFeedback('Could not save this listing. Check your connection and try again.')
    } finally {
      setFallbackSaving(false)
    }
  }

  // ========== TAB CONTENT COMPONENTS (kept inside for a single cohesive file while remaining scannable) ==========

  const OverviewTab = () => {
    const planName = activePlan?.name ?? 'Free'
    const paidSubscriptionPlan = billingPlans.find((plan) => plan.id === billingState?.plan_id)
    const priceLine = hasEnterpriseOverride
      ? 'Grandfathered access'
      : promotion
        ? '$0 during promotion'
      : activePlan
        ? `${activePlan.price}/${activePlan.cadence}`
        : 'No subscription'
    const billingStatus = billingStatusCopy(billingState?.status)
    const status = hasEnterpriseOverride
      ? { label: 'Granted', tone: 'ok' as const }
      : promotion
        ? { label: 'Promotional', tone: 'ok' as const }
      : billingStatus
    const statusPillClass =
      status.tone === 'ok'
        ? 'border-[var(--ready)]/40 bg-[var(--ready)]/10 text-[var(--ready)]'
        : status.tone === 'warn'
          ? 'border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]'
          : 'border-[var(--bd-20)] bg-white/5 text-[var(--fg-muted)]'
    // Recovery banner for states that need the user to act (past_due/unpaid →
    // update payment; incomplete → finish checkout). Drives the dead-until-now
    // billingStatusCopy helper.
    const needsAction = billingStatus.tone === 'warn'
    const isIncomplete = billingState?.status === 'incomplete'
    const periodEndSource = promotion?.endsAt ?? billingState?.current_period_end
    const periodEnd = periodEndSource
      ? new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(periodEndSource))
      : null

    return (
      <div className="space-y-8">
        {needsAction && (
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--amber)]/40 bg-[var(--amber)]/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--amber)]" />
              <div>
                <p className="font-medium text-white">
                  {isIncomplete ? 'Your checkout is unfinished' : 'Your payment needs attention'}
                </p>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  {isIncomplete
                    ? 'Complete payment to activate your subscription.'
                    : 'We couldn’t process your latest payment. Update your payment method to keep your plan active.'}
                </p>
              </div>
            </div>
            {isIncomplete ? (
              <button
                onClick={() => setActiveTab('plans')}
                className="shrink-0 rounded-2xl bg-[var(--signal-solid)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Finish checkout
              </button>
            ) : (
              <form action="/api/billing/portal" method="post" className="shrink-0">
                <button className="rounded-2xl bg-[var(--signal-solid)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90">
                  Update payment method
                </button>
              </form>
            )}
          </div>
        )}

        {/* 1. Current Plan – Large hero-style glass card */}
        <GlassCard className="p-8 md:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-5xl font-semibold tracking-[-1.5px]">{planName}</span>
                <span className={`rounded-full border px-4 py-1 text-xs font-medium tracking-[1px] uppercase ${statusPillClass}`}>
                  {status.label}
                </span>
              </div>
              <div className="mt-2 text-3xl text-[var(--fg-muted)] tracking-tight">{priceLine}</div>
              <div className="mt-3 text-sm text-[var(--fg-muted)]">
                <span className="font-semibold text-white">{commissionPct}% Nexez platform commission</span>
                {' · '}
                {commissionSource === 'enterprise_override'
                  ? 'negotiated commercial terms'
                  : commissionSource === 'promotion'
                    ? 'promotional plan rate'
                    : 'current plan rate'}
              </div>
              {periodEnd && promotion && (
                <p className="mt-3 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <Calendar className="size-4" />
                  Complimentary through {periodEnd}
                </p>
              )}
              {periodEnd && !promotion && !hasEnterpriseOverride && (
                <p className="mt-3 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <Calendar className="size-4" />
                  {billingState?.cancel_at_period_end ? 'Cancels' : 'Renews'} on {periodEnd}
                </p>
              )}
              {periodEnd && hasEnterpriseOverride && billingState?.stripe_subscription_id && (
                <p className="mt-3 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <Calendar className="size-4" />
                  Separate {paidSubscriptionPlan?.name ?? 'paid'} subscription {billingState.cancel_at_period_end ? 'cancels' : 'renews'} on {periodEnd}
                </p>
              )}
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                {hasEnterpriseOverride
                  ? 'Enterprise privileges remain active independently of Stripe billing.'
                  : promotion
                    ? 'Returns to Free when the promotion ends. No automatic charge.'
                  : activePlan?.cadence
                    ? `Billed ${activePlan.cadence} • Cancel anytime via Stripe portal`
                    : 'No active subscription • Upgrade anytime'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {activePlan?.id !== 'enterprise' && (
                <button
                  onClick={() => setActiveTab('plans')}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[var(--signal-solid)] px-8 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80"
                >
                  <ArrowUp className="size-4" /> Upgrade plan
                </button>
              )}
              {billingState?.stripe_subscription_id && (
                <form action="/api/billing/portal" method="post">
                  <button className="rounded-2xl border border-[var(--bd-15)] px-6 py-3 text-sm hover:bg-white/5 transition">
                    Manage subscription
                  </button>
                </form>
              )}
              <a
                href="/pricing"
                className="rounded-2xl border border-[var(--bd-15)] px-6 py-3 text-sm hover:bg-white/5 transition inline-flex items-center"
              >
                Full comparison
              </a>
            </div>
          </div>
        </GlassCard>

        {promotion && fallbackPages.length > 1 && (
          <GlassCard className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <div className="text-sm font-medium text-white">Free-plan fallback listing</div>
                <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
                  Choose the listing that stays published if you return to Free. Every other listing remains saved as a draft.
                </p>
              </div>
              <div className="w-full md:max-w-sm">
                <label htmlFor="promotion-fallback-page" className="sr-only">Fallback listing</label>
                <div className="flex items-center gap-2">
                  <select
                    id="promotion-fallback-page"
                    value={fallbackPageId}
                    onChange={(event) => saveFallbackPage(event.target.value)}
                    disabled={fallbackSaving}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--bd-15)] bg-[#11141a] px-3 text-sm text-white outline-none focus:border-[var(--signal)] disabled:opacity-60"
                  >
                    {fallbackPages.map((page) => (
                      <option key={page.id} value={page.id}>{page.name}</option>
                    ))}
                  </select>
                  {fallbackSaving && <Loader2 className="size-4 animate-spin text-[var(--signal)]" />}
                </div>
                {fallbackFeedback && <p className="mt-2 text-xs text-[var(--fg-muted)]">{fallbackFeedback}</p>}
              </div>
            </div>
          </GlassCard>
        )}

        {/* How money flows - the dual-revenue model in one glance */}
        <GlassCard className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
            <MoneyFlowStep label="Sales through Nexez" value={formatCurrencyAmount(agentRevenueCents, revenueCurrency)} sub="paid sales this month" tone="white" />
            <FlowArrow />
            <MoneyFlowStep label={`Nexez fee (${commissionPct}%)`} value={`– ${formatCurrencyAmount(platformFeesCents, revenueCurrency)}`} sub="only when you get paid" tone="muted" />
            <FlowArrow />
            <MoneyFlowStep
              label="Payment processing"
              value={processorFeesCents == null ? 'See Stripe' : `– ${formatCurrencyAmount(processorFeesCents, revenueCurrency)}`}
              sub="separate processor charge"
              tone="muted"
            />
            <FlowArrow />
            <MoneyFlowStep label="Before processing" value={formatCurrencyAmount(Math.max(0, agentRevenueCents - platformFeesCents), revenueCurrency)} sub="processor fees not deducted here" tone="ready" />
          </div>
          <p className="mt-4 border-t border-[var(--bd-10)] pt-3 text-xs text-[var(--fg-muted)]">
            Transaction fees are separate from your{' '}
            <span className="text-white">{hasEnterpriseOverride ? 'Enterprise access' : `${activePlan?.name ?? 'Free'} subscription`}</span>
            {!hasEnterpriseOverride && activePlan?.cadence ? ` (${activePlan.price}/${activePlan.cadence})` : ''}. They apply only to sales completed through Nexez. External-provider handoffs have no Nexez transaction fee unless separately agreed. Card-processing fees are separate.
          </p>
        </GlassCard>

        {nextPlan && nextEconomics && currentEconomics && (
          <GlassCard className="p-7">
            <SectionHeader icon={Sparkles} title={`${nextPlan.name} economics`} subtitle="Subscription and Nexez commission compared together" />
            {nextTierSavingsCents > 0 ? (
              <p className="text-sm text-[var(--ready)]">
                At this month&rsquo;s sales volume, {nextPlan.name} would have saved approximately{' '}
                <span className="font-semibold">{formatCurrencyAmount(nextTierSavingsCents, revenueCurrency)}</span> in Nexez subscription and platform fees.
              </p>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                {nextTierBreakevenCents == null
                  ? `${nextPlan.name} does not have a lower total Nexez cost at this rate.`
                  : `${nextPlan.name} costs about the same at ${formatCurrencyAmount(nextTierBreakevenCents, revenueCurrency)} in monthly sales through Nexez.`}
              </p>
            )}
            <p className="mt-2 text-xs text-[var(--fg-muted)]">Payment-processing fees are excluded because they are separate from Nexez pricing.</p>
          </GlassCard>
        )}

        {/* Usage + Platform Fees summary side-by-side (elegant overview) */}
        <div className="grid gap-6 lg:grid-cols-2">
          <GlassCard className="p-7">
            <SectionHeader icon={BarChart3} title="Usage snapshot" subtitle="This billing cycle" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[usage.pages, usage.offers, usage.aiOptimizations].map((m, idx) => {
                const capped = m.limit != null
                const pct = capped ? Math.min(100, Math.round((m.current / (m.limit || 1)) * 100)) : 0
                return (
                  <div key={idx} className="rounded-2xl border border-[var(--bd-10)] bg-[var(--ov-015)] p-4">
                    <div className="text-sm text-[var(--fg-muted)]">{m.label}</div>
                    <div className="mt-3 text-3xl font-semibold tracking-tighter">
                      {m.current}
                      {capped && <span className="text-base font-normal text-[var(--fg-muted)]"> / {m.limit === 999 ? '∞' : m.limit}</span>}
                    </div>
                    {capped && (
                      <div className="mt-3 h-1.5 rounded bg-white/10 overflow-hidden">
                        <div className="h-1.5 bg-[var(--signal-solid)] transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-7">
            <SectionHeader icon={Percent} title="Platform fees this month" subtitle="Transaction commissions" />
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tighter text-[var(--ready)]">{formatCurrencyAmount(platformFeesCents, revenueCurrency)}</span>
              <span className="text-[var(--fg-muted)]">this month</span>
            </div>
            <div className="mt-4 text-sm text-[var(--fg-muted)]">
              This total uses each transaction&rsquo;s charge-time fee snapshot. Connect your Stripe account in the
              <span className="text-white"> Platform Fees</span> tab to receive payouts directly.
            </div>
            <button
              onClick={() => setActiveTab('fees')}
              className="mt-5 text-sm text-[var(--signal)] hover:underline inline-flex items-center gap-1"
            >
              View full breakdown &amp; connect payouts <ArrowUp className="size-3 rotate-45" />
            </button>
          </GlassCard>
        </div>

        {/* Payment method (requirement #3) – consolidated */}
        <GlassCard className="p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-16 items-center justify-center rounded-2xl border border-[var(--bd-10)] bg-[var(--ov-04)] font-mono text-xs text-[var(--fg-muted)]">
                {billingState?.stripe_customer_id ? '••••' : '-'}
              </div>
              <div>
                <div className="font-medium">Payment method</div>
                <div className="text-sm text-[var(--fg-muted)] mt-0.5">
                  {billingState?.stripe_customer_id
                    ? 'Card on file is stored and managed securely by Stripe.'
                    : 'No payment method is attached yet.'}
                </div>
              </div>
            </div>
            {billingState?.stripe_customer_id ? (
              <form action="/api/billing/portal" method="post">
                <button className="rounded-2xl border border-[var(--bd-15)] px-5 py-2.5 text-sm hover:bg-white/5 transition">
                  Update payment method →
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('plans')}
                className="rounded-2xl border border-[var(--bd-15)] px-5 py-2.5 text-sm hover:bg-white/5 transition"
              >
                Choose a paid plan
              </button>
            )}
          </div>
        </GlassCard>
      </div>
    )
  }

  const UsageTab = () => (
    <div className="space-y-6">
      <SectionHeader icon={BarChart3} title="Usage overview" subtitle="Detailed metrics for the current period" />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          usage.pages,
          usage.offers,
          usage.aiOptimizations,
          usage.simulations,
          usage.impressions,
        ].map((metric, index) => {
          const capped = metric.limit != null
          const pct = capped ? Math.min(100, Math.round((metric.current / (metric.limit || 1)) * 100)) : 0
          return (
            <GlassCard key={index} className="p-6 flex flex-col">
              <div className="text-sm text-[var(--fg-muted)] mb-4">{metric.label}</div>

              <div className="flex items-end justify-between mt-auto">
                <div>
                  <div className="text-4xl font-semibold tracking-tighter tabular-nums">
                    {metric.current}
                    {capped && <span className="text-lg font-normal text-[var(--fg-muted)]"> / {metric.limit === 999 ? '∞' : metric.limit}</span>}
                  </div>
                  <div className="text-[10px] uppercase tracking-[1px] text-[var(--fg-muted)] mt-1">{capped ? `${pct}% used` : 'this month'}</div>
                </div>
                {capped && <ProgressRing current={metric.current} limit={metric.limit ?? 0} />}
              </div>

              <div className="mt-5 h-px bg-white/10" />
              <div className="mt-3 text-xs text-[var(--fg-muted)]">{capped ? 'Resets with your billing cycle' : 'Live engagement'}</div>
            </GlassCard>
          )
        })}
      </div>

      <div className="text-xs text-[var(--fg-muted)] px-1">
        Usage data powers your agent limits and is reset on each renewal date. Enterprise plans have higher or custom limits.
      </div>
    </div>
  )

  const BillingHistoryTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader icon={History} title="Billing history" subtitle="Recent invoices and account records" />
        <form action="/api/billing/portal" method="post">
          <button className="text-sm text-[var(--signal)] hover:underline flex items-center gap-1">
            View full history in Stripe <Download className="size-3.5" />
          </button>
        </form>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--bd-10)] text-left text-[var(--fg-muted)] uppercase tracking-[1px] text-xs">
                <th className="px-6 py-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('date')}>
                  Date {sortKey === 'date' && (sortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-6 py-4 font-medium">Description</th>
                <th className="px-6 py-4 font-medium cursor-pointer select-none text-right" onClick={() => toggleSort('amount')}>
                  Amount {sortKey === 'amount' && (sortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sortedInvoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-[var(--fg-muted)]">
                    No invoices yet. Paid-subscription invoices appear here (and in your Stripe portal) after your first payment.
                  </td>
                </tr>
              )}
              {sortedInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--ov-015)] transition">
                  <td className="px-6 py-4 font-mono text-xs text-[var(--fg-muted)]">{inv.date}</td>
                  <td className="px-6 py-4">{inv.description}</td>
                  <td className="px-6 py-4 text-right tabular-nums">${inv.amount.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block rounded-full px-3 py-0.5 text-xs ${
                        inv.status === 'paid'
                          ? 'bg-[var(--ready)]/10 text-[var(--ready)]'
                          : inv.status === 'pending'
                            ? 'bg-[var(--amber)]/10 text-[var(--amber)]'
                            : 'bg-red-400/10 text-red-300'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleInvoiceDownload(inv)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--bd-15)] px-3 py-1 text-xs hover:bg-white/5 transition"
                    >
                      {inv.hostedUrl
                        ? <><Download className="size-3.5" /> Download</>
                        : <><ExternalLink className="size-3.5" /> Open in Stripe</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <p className="text-center text-xs text-[var(--fg-muted)]">
        All invoices and receipts are also available in your Stripe customer portal.
      </p>
    </div>
  )

  const PlatformFeesTab = () => {
    return (
      <div className="space-y-8">
        <GlassCard className="p-8">
          <SectionHeader icon={Percent} title="Platform fees & payouts" subtitle={`${commissionPct}% current Nexez commission`} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeeMetric label="Sales through Nexez" value={formatCurrencyAmount(agentRevenueCents, revenueCurrency)} />
            <FeeMetric label="Nexez platform fees" value={formatCurrencyAmount(platformFeesCents, revenueCurrency)} />
            <FeeMetric
              label="Payment processing"
              value={processorFeesCents == null ? 'See Stripe' : formatCurrencyAmount(processorFeesCents, revenueCurrency)}
            />
            <FeeMetric label="Before processing" value={formatCurrencyAmount(Math.max(0, agentRevenueCents - platformFeesCents), revenueCurrency)} />
          </div>
          <p className="mt-6 text-sm text-[var(--fg-muted)]">
            Nexez commission applies only to sales completed through Nexez. Card-processing fees are separate and are not included in the before-processing amount. External-provider handoffs have no Nexez transaction fee unless separately agreed.
          </p>
          <div className="mt-6 grid gap-2 text-xs text-[var(--fg-muted)] sm:grid-cols-2 lg:grid-cols-5">
            {billingPlans.map((plan) => (
              <div key={plan.id} className="rounded-lg border border-[var(--bd-10)] p-3">
                <span className="text-white">{plan.name}</span>{' '}
                {plan.id === 'enterprise' ? 'typically 1–2%' : `${plan.commissionPercent}%`}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Stripe Connect – full management (dual revenue model) */}
        <GlassCard className="p-8">
          <div className="mb-6">
            <div className="text-lg font-semibold tracking-tight">Payout account (Stripe Connect)</div>
            <div className="text-sm text-[var(--fg-muted)]">Receive earnings from transactions (you are the merchant of record for customer payments).</div>
          </div>

          {billingState?.stripe_connect_account_id ? (
            <div className="space-y-4">
              <div className="font-mono text-xs text-[var(--fg-muted)] break-all">{billingState.stripe_connect_account_id}</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Details submitted', ok: billingState.stripe_connect_details_submitted },
                  { label: 'Charges enabled', ok: billingState.stripe_connect_charges_enabled },
                  { label: 'Payouts enabled', ok: billingState.stripe_connect_payouts_enabled },
                ].map((s, i) => (
                  <span
                    key={i}
                    className={`rounded px-3 py-1 text-xs ${s.ok ? 'bg-[var(--ready)]/10 text-[var(--ready)]' : 'bg-[var(--amber)]/10 text-[var(--amber)]'}`}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <StripeConnectButton isConnected />
                <RefreshConnectButton />
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[var(--fg-muted)] max-w-prose">
                Connect your Stripe account (Express) so Nexez can pay out your agent-driven earnings directly to your bank.
              </p>
              <div className="mt-5">
                <StripeConnectButton />
              </div>
            </div>
          )}

          <div className="mt-8 text-[10px] text-[var(--fg-muted)]">
            Separate from your Nexez subscription billing. Transaction revenue uses Stripe Connect + application fees.
          </div>
        </GlassCard>
      </div>
    )
  }

  const PlansTab = () => {
    const currentId = activePlan?.id || 'free'

    return (
      <div className="space-y-8">
        <div>
          <SectionHeader icon={Sparkles} title="Plans & Pricing" subtitle="Switch plans anytime. Billed monthly. Cancel via Stripe portal." />
          <p className="text-sm text-[var(--fg-muted)] max-w-prose">
            Paid plans include lower platform fees on transactions. All plans (including Free) allow you to earn through your published agents.
          </p>
        </div>

        {/* Beautiful plan comparison cards */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {billingPlans.map((plan, planIndex) => {
            const isCurrent = plan.id === currentId
            const isLoadingThis = checkoutLoading === plan.id
            const isSelected = selectedPlanId === plan.id
            const planCheckoutReady = plan.id === 'free' || plan.id === 'enterprise' || configuredPlanIds.includes(plan.id)
            const planEconomics = getPlanEconomics(plan.id)
            const planTotalCents = planEconomics ? monthlyNexezCost(agentRevenueCents, planEconomics) : null
            const honestSavingsCents =
              !isCurrent && activePlan && plan.rank > activePlan.rank && currentMonthlyNexezCost != null && planTotalCents != null
                ? currentMonthlyNexezCost - planTotalCents
                : 0

            return (
              <GlassCard
                key={plan.id}
                className={`p-7 flex flex-col transition-all ${isSelected ? 'ring-1 ring-[var(--signal)]/60 border-[var(--signal)]/50' : 'hover:border-[var(--bd-20)]'} ${isCurrent ? 'border-[var(--signal)]/30' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-2xl font-semibold tracking-tight">{plan.name}</div>
                    <div className="text-xs text-[var(--fg-muted)] mt-0.5">{plan.blurb}</div>
                  </div>
                  {plan.id === 'pro' && (
                    <span className="rounded-full bg-[var(--signal-solid)] px-2.5 py-px text-[10px] font-medium tracking-widest text-white">POPULAR</span>
                  )}
                  {isCurrent && (
                    <span className="rounded-full border border-[var(--bd-20)] px-2.5 py-px text-[10px] text-[var(--fg-muted)]">CURRENT</span>
                  )}
                </div>

                <div className="mt-6">
                  <span className="text-5xl font-semibold tracking-tighter">{plan.price}</span>
                  {plan.price !== 'Custom' && <span className="text-[var(--fg-muted)] text-sm ml-1">/{plan.cadence}</span>}
                </div>

                <div className="text-xs text-[var(--fg-muted)] mt-1">
                  {isCurrent ? commissionPct : plan.id === 'enterprise' ? 'Typically 1–2' : plan.commissionPercent}% platform fee on sales through Nexez
                </div>
                {honestSavingsCents > 0 && (
                  <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md bg-[var(--ready)]/10 px-2 py-1 text-xs font-medium text-[var(--ready)]">
                    Would have saved about {formatCurrencyAmount(honestSavingsCents, revenueCurrency)} this month
                  </div>
                )}

                <ul className="mt-6 space-y-2.5 text-sm flex-1 text-[var(--fg-muted)]">
                  {planIndex > 0 ? (
                    <li className="flex items-start gap-2.5 font-medium text-white">
                      <Check className="mt-1 size-3.5 text-[var(--ready)]/90 shrink-0" />
                      <span>Everything in {billingPlans[planIndex - 1].name}, plus:</span>
                    </li>
                  ) : null}
                  {plan.features.map((f, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="mt-1 size-3.5 text-[var(--ready)]/90 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  {isCurrent ? (
                    <button
                      onClick={() => setActiveTab('overview')}
                      className="w-full rounded-2xl border border-[var(--bd-15)] py-3 text-sm hover:bg-white/5 transition"
                    >
                      Manage current plan
                    </button>
                  ) : plan.id === 'enterprise' ? (
                    <a
                      href="/support"
                      className="block w-full text-center rounded-2xl border border-[var(--bd-15)] py-3 text-sm hover:bg-white/5 transition"
                    >
                      Contact sales
                    </a>
                  ) : plan.id === 'free' ? (
                    promotion && !billingState?.stripe_subscription_id ? (
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-2xl border border-[var(--bd-15)] py-3 text-sm text-[var(--fg-muted)] opacity-70"
                      >
                        Automatic fallback
                      </button>
                    ) : billingState?.stripe_subscription_id ? (
                      <form action="/api/billing/portal" method="post">
                        <button className="w-full rounded-2xl border border-[var(--bd-15)] py-3 text-sm hover:bg-white/5 transition">
                          Manage downgrade in Stripe
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-2xl border border-[var(--bd-15)] py-3 text-sm text-[var(--fg-muted)] opacity-70"
                      >
                        No subscription to cancel
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => startEmbeddedCheckout(plan.id)}
                      disabled={!stripeReady || !planCheckoutReady || !!isLoadingThis || !!clientSecret}
                      className="w-full rounded-2xl bg-[var(--signal-solid)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 active:opacity-80"
                    >
                      {isLoadingThis ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" /> Starting checkout…
                        </span>
                      ) : !stripeReady || !planCheckoutReady ? (
                        'Checkout not ready'
                      ) : (
                        'Select & pay with card'
                      )}
                    </button>
                  )}
                  {!isCurrent && plan.id !== 'enterprise' && !planCheckoutReady && (
                    <p className="mt-2 text-center text-xs text-[var(--amber)]">Price ID missing or invalid.</p>
                  )}
                </div>
              </GlassCard>
            )
          })}
        </div>

        {/* Inline glassmorphic Embedded Checkout panel (requirement #7) */}
        {(selectedPlanId || clientSecret || checkoutError || checkoutSuccess) && (
          <GlassCard className="p-8 border-[var(--signal)]/40">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="uppercase tracking-[2px] text-xs text-[var(--fg-muted)]">Secure checkout</div>
                <div className="text-xl font-semibold tracking-tight mt-1">
                  {selectedPlanId ? `Upgrade to ${billingPlans.find(p => p.id === selectedPlanId)?.name}` : 'Complete your subscription'}
                </div>
              </div>
              <button onClick={resetCheckout} className="text-sm text-[var(--fg-muted)] hover:text-white">Close</button>
            </div>

            {checkoutSuccess && (
              <div className="rounded-2xl border border-[var(--ready)]/30 bg-[var(--ready)]/10 p-5 text-[var(--ready)]">
                {checkoutSuccess}
              </div>
            )}

            {checkoutError && (
              <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-300 mb-4">
                {checkoutError}
                <button onClick={resetCheckout} className="ml-3 underline">Try again</button>
              </div>
            )}

            {clientSecret && selectedPlanId && (
              <EmbeddedSubscriptionForm
                plan={billingPlans.find((p) => p.id === selectedPlanId)!}
                clientSecret={clientSecret}
                onSuccess={handleEmbeddedSuccess}
                onCancel={resetCheckout}
              />
            )}

            {!clientSecret && !checkoutError && !checkoutSuccess && (
              <p className="text-sm text-[var(--fg-muted)]">Select a plan above to begin the secure embedded checkout flow.</p>
            )}
          </GlassCard>
        )}

        <p className="text-center text-[10px] text-[var(--fg-muted)]">
          Stripe processes subscriptions. Nexez commission applies only to sales completed through Nexez. Card-processing fees are separate.
        </p>
      </div>
    )
  }

  // ========== RENDER ==========
  return (
    <div className="space-y-8">
      {/* Shared platform tab bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--bd-10)] pb-1">
        <div className="platform-tablist" role="tablist" aria-label="Billing views">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className="platform-tab px-3.5 sm:px-5"
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="ml-auto text-xs text-[var(--fg-muted)] hidden md:block">All changes sync via Stripe webhooks</div>
      </div>

      {/* Active tab content - called as functions (not <Capitalized /> JSX) to satisfy react-hooks/static-components lint */}
      <div>
        {activeTab === 'overview' && OverviewTab()}
        {activeTab === 'usage' && UsageTab()}
        {activeTab === 'history' && BillingHistoryTab()}
        {activeTab === 'fees' && PlatformFeesTab()}
        {activeTab === 'plans' && PlansTab()}
      </div>

      {/* Subtle footer note */}
      <div className="pt-4 text-center text-[10px] text-[var(--fg-muted)]">
        Questions? <a href="/support" className="underline hover:text-white">Contact support</a> - we usually reply within a few hours.
      </div>
    </div>
  )
}

function MoneyFlowStep({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'white' | 'muted' | 'ready' }) {
  const valueClass = tone === 'ready' ? 'text-[var(--ready)]' : tone === 'muted' ? 'text-[var(--fg-muted)]' : 'text-white'
  return (
    <div className="flex-1">
      <p className="text-xs uppercase tracking-wide text-[var(--fg-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{sub}</p>
    </div>
  )
}

function FeeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--bd-10)] bg-[var(--ov-015)] p-5">
      <p className="text-xs uppercase tracking-wide text-[var(--fg-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  )
}

function FlowArrow() {
  return <div className="hidden shrink-0 items-center text-2xl text-[var(--fg-muted-2)] sm:flex">→</div>
}
