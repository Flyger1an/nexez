import type Stripe from 'stripe'
import { BillingPlan, billingPlans } from './billing'

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
}

export function getPlanIdForStripePrice(priceId: string | null | undefined): BillingPlan['id'] | null {
  if (!priceId) return null
  return billingPlans.find((plan) => process.env[plan.envVar] === priceId)?.id ?? null
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
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
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
