import Stripe from 'stripe'
import { BillingPlan, billingPlans, getPlanPriceId } from './billing'

export type BillingSubscription = {
  owner_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  plan_id: BillingPlan['id'] | null
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  checkout_session_id: string | null
  latest_invoice_id: string | null
  metadata: Record<string, unknown>
  created_at?: string
  updated_at?: string
  // Stripe Connect for transaction payments (ALL plans, incl Free for commission)
  stripe_connect_account_id?: string | null
  stripe_connect_status?: string | null
  stripe_connect_details_submitted?: boolean | null
  stripe_connect_charges_enabled?: boolean | null
  stripe_connect_payouts_enabled?: boolean | null
}

/**
 * Stripe subscription statuses that mean "this is the customer's live subscription".
 * Mirrors the LIVE_STATUSES set the entitlement resolvers grant plans for.
 */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'unpaid'] as const

/** The customer's live subscription, if any — the one a plan change must UPDATE, never duplicate. */
export function pickLiveStripeSubscription<T extends { status: string }>(subscriptions: T[]): T | null {
  return subscriptions.find((s) => (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(s.status)) ?? null
}

/**
 * Pre-payment subscription states must never overwrite real billing state. A user who
 * merely OPENS (then abandons) the embedded payment sheet mints an 'incomplete'
 * subscription; syncing that status over a live no-card trial kills the trial's
 * entitlements, and syncing it over 'paused' permanently un-pauses the storefront
 * (nothing ever re-pauses a non-'trialing' row). The row is either already
 * 'incomplete' (fresh link row) or holds a state strictly more truthful.
 */
export function shouldSkipSubscriptionSync(status: string | null | undefined): boolean {
  return status === 'incomplete' || status === 'incomplete_expired'
}

/**
 * DB-managed lifecycle states (the no-card trial and its expiry pause) have no Stripe
 * subscription behind them - Stripe silence is EXPECTED and must not be "reconciled"
 * into canceled/incomplete. Only a live Stripe subscription may overwrite these.
 */
export function isDbManagedBillingStatus(status: string | null | undefined): boolean {
  return status === 'trialing' || status === 'paused'
}

export function getPlanIdForStripePrice(priceId: string | null | undefined): BillingPlan['id'] | null {
  if (!priceId) return null
  return billingPlans.find((plan) => getPlanPriceId(plan) === priceId)?.id ?? null
}

export function normalizePlanId(value: string | null | undefined): BillingPlan['id'] | null {
  return billingPlans.some((plan) => plan.id === value) ? (value as BillingPlan['id']) : null
}

export function stripeObjectId(value: string | { id?: string | null } | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.id || null
}

export function stripeTimestamp(value: number | null | undefined): string | null {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null
}

export function getSubscriptionPriceId(subscription: Stripe.Subscription | null | undefined): string | null {
  const item = subscription?.items?.data?.[0]
  return item?.price?.id ?? null
}

export function getSubscriptionPeriod(subscription: Stripe.Subscription | null | undefined) {
  const sub = subscription as any
  const item = subscription?.items?.data?.[0] as any

  return {
    currentPeriodStart: stripeTimestamp(sub?.current_period_start ?? item?.current_period_start),
    currentPeriodEnd: stripeTimestamp(sub?.current_period_end ?? item?.current_period_end),
  }
}

/**
 * Stripe can schedule an end-of-service cancellation with either the legacy
 * cancel_at_period_end flag or an explicit cancel_at timestamp. Treat both as
 * a pending cancellation so the dashboard never claims the plan will renew.
 */
export function hasScheduledCancellation(subscription: Stripe.Subscription | null | undefined): boolean {
  return Boolean(subscription?.cancel_at_period_end || subscription?.cancel_at)
}

export function buildBillingSubscriptionRow(input: {
  ownerId: string
  session?: Stripe.Checkout.Session | null
  subscription?: Stripe.Subscription | null
  fallbackPlanId?: string | null
  fallbackPriceId?: string | null
  eventId?: string
  eventType?: string
}): BillingSubscription {
  const subscription = input.subscription
  const session = input.session
  const priceId = getSubscriptionPriceId(subscription) ?? input.fallbackPriceId ?? null
  const period = getSubscriptionPeriod(subscription)
  const status = subscription?.status ?? (session?.payment_status === 'paid' ? 'active' : session?.status) ?? 'unknown'

  return {
    owner_id: input.ownerId,
    stripe_customer_id: stripeObjectId(subscription?.customer) ?? stripeObjectId(session?.customer),
    stripe_subscription_id: subscription?.id ?? stripeObjectId(session?.subscription),
    stripe_price_id: priceId,
    plan_id: getPlanIdForStripePrice(priceId) ?? normalizePlanId(input.fallbackPlanId),
    status,
    current_period_start: period.currentPeriodStart,
    current_period_end: period.currentPeriodEnd,
    cancel_at_period_end: hasScheduledCancellation(subscription),
    checkout_session_id: session?.id ?? null,
    latest_invoice_id: stripeObjectId(subscription?.latest_invoice) ?? stripeObjectId(session?.invoice),
    metadata: {
      source: input.eventType || 'stripe',
      stripe_event_id: input.eventId || null,
    },
  }
}

export function billingStatusCopy(status: string | null | undefined) {
  switch (status) {
    case 'active':
    case 'trialing':
      return { label: 'Active', tone: 'ok' as const }
    case 'past_due':
    case 'unpaid':
      return { label: 'Payment attention needed', tone: 'warn' as const }
    case 'canceled':
    case 'incomplete_expired':
      return { label: 'Canceled', tone: 'muted' as const }
    case 'incomplete':
      return { label: 'Checkout incomplete', tone: 'warn' as const }
    default:
      return { label: 'Not subscribed', tone: 'muted' as const }
  }
}

/**
 * Stripe Connect helpers for transaction revenue (owner is MoR, Nexez takes commission via app fee on all plans incl Free).
 * Uses Express accounts for easy onboarding.
 */
export async function createStripeConnectAccount(ownerId: string, email: string, businessName?: string) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email,
    business_profile: businessName ? { name: businessName } : undefined,
    metadata: { nexez_owner_id: ownerId },
  })
  return account
}

export async function createStripeConnectOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })
  return link
}

export function getCommissionPercentForPlan(planId: BillingPlan['id'] | null | undefined): number {
  const plan = billingPlans.find(p => p.id === planId)
  return plan?.commissionPercent ?? 15 // default 15% for free or unknown
}

export function calculateApplicationFeeCents(amountCents: number, commissionPercent: number): number {
  if (!amountCents || amountCents <= 0) return 0
  return Math.round(amountCents * (commissionPercent / 100))
}
