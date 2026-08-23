import Stripe from 'stripe'
import {
  BillingPlan,
  billingPlans,
  getPlanPriceId,
  BASIS_POINTS_PER_PERCENT,
  BASIS_POINTS_PER_WHOLE,
  getCommissionBpsForPlan as getPlanCommissionBps,
} from './billing'

export type BillingSubscription = {
  owner_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  plan_id: BillingPlan['id'] | null
  status: string
  current_period_start: string | null
  current_period_end: string | null
  trial_ends_at: string | null
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
 * Stripe subscription statuses that mean "this row IS the customer's current
 * subscription", i.e. the one a plan change must update rather than duplicate.
 *
 * This is deliberately NOT the entitlement rule. Whether a subscription confers
 * its plan is subscriptionConfers() in lib/server/plan.ts, which is stricter: a
 * 'trialing' row confers only inside its window. A trial that has expired is
 * still the customer's current row (so it belongs here) while granting nothing.
 * Do not reuse this set to gate a feature.
 */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'unpaid'] as const

/** The customer's live subscription, if any - the one a plan change must UPDATE, never duplicate. */
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
 * DB-managed lifecycle states (the no-card trial and its recorded expiry) have no Stripe
 * subscription behind them - Stripe silence is EXPECTED and must not be "reconciled"
 * into canceled/incomplete. Only a live Stripe subscription may overwrite these.
 */
export function isDbManagedBillingStatus(status: string | null | undefined): boolean {
  return status === 'trialing' || status === 'paused' || status === 'expired'
}

export function getPlanIdForStripePrice(priceId: string | null | undefined): BillingPlan['id'] | null {
  if (!priceId) return null
  const matches = billingPlans.filter((plan) => getPlanPriceId(plan) === priceId)
  return matches.length === 1 ? matches[0].id : null
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
  const resolvedPricePlanId = getPlanIdForStripePrice(priceId)
  const period = getSubscriptionPeriod(subscription)
  const status = subscription?.status ?? (session?.payment_status === 'paid' ? 'active' : session?.status) ?? 'unknown'

  return {
    owner_id: input.ownerId,
    stripe_customer_id: stripeObjectId(subscription?.customer) ?? stripeObjectId(session?.customer),
    stripe_subscription_id: subscription?.id ?? stripeObjectId(session?.subscription),
    stripe_price_id: priceId,
    // Stripe's concrete Price is authoritative when present. Metadata fallback
    // is only for payloads that genuinely have no Price yet; an unknown or
    // duplicate Price must fail closed instead of granting its claimed plan.
    plan_id: priceId ? resolvedPricePlanId : normalizePlanId(input.fallbackPlanId),
    status,
    current_period_start: period.currentPeriodStart,
    current_period_end: period.currentPeriodEnd,
    trial_ends_at: stripeTimestamp(subscription?.trial_end),
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
    case 'expired':
    case 'paused':
      return { label: 'Trial ended', tone: 'muted' as const }
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
  }, {
    // A database allocation race can reject persistence after Stripe accepts the
    // request. Reusing the owner-scoped key makes the documented retry return the
    // same Express account instead of creating another remote account.
    idempotencyKey: `nexez-connect-account-v1:${ownerId}`,
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

/** Canonical plan-default rate for settlement arithmetic. */
export function getCommissionBpsForPlan(planId: BillingPlan['id'] | null | undefined): number {
  return getPlanCommissionBps(planId)
}

/** Compatibility wrapper for display/legacy callers while settlement migrates to bps. */
export function getCommissionPercentForPlan(planId: BillingPlan['id'] | null | undefined): number {
  return getCommissionBpsForPlan(planId) / BASIS_POINTS_PER_PERCENT
}

/**
 * Deterministic integer-cents commission arithmetic. Basis points keep negotiated
 * rates such as Enterprise 1.5% (150 bps) out of floating-point business logic.
 */
export function calculateApplicationFeeCentsFromBps(amountCents: number, commissionBps: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0
  if (!Number.isFinite(commissionBps) || commissionBps <= 0) return 0
  const cents = Math.round(amountCents)
  const basisPoints = Math.round(commissionBps)
  return Math.round((cents * basisPoints) / BASIS_POINTS_PER_WHOLE)
}

/**
 * Legacy percent-based wrapper. Existing checkout paths keep identical call
 * semantics while the core moves to basis points; later settlement PRs can call
 * calculateApplicationFeeCentsFromBps directly.
 */
export function calculateApplicationFeeCents(amountCents: number, commissionPercent: number): number {
  if (!Number.isFinite(commissionPercent)) return 0
  return calculateApplicationFeeCentsFromBps(
    amountCents,
    Math.round(commissionPercent * BASIS_POINTS_PER_PERCENT),
  )
}
