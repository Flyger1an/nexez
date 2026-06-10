export type BillingPlan = {
  id: 'free' | 'launch' | 'pro' | 'scale' | 'enterprise'
  name: string
  price: string
  cadence: string
  envVar: string
  blurb: string
  features: string[]
  /** Platform commission % on agent-driven transactions (applied via Stripe Application Fee). Free plan still pays commission (no subscription). */
  commissionPercent: number
}

export const billingPlans: BillingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'month',
    envVar: '', // no price for free
    blurb: 'Try Nexez with limited pages and features.',
    features: ['1 published page', 'Basic agent artifacts', 'Directory listing', 'Manual analytics'],
    commissionPercent: 15, // Free pays higher commission, no subscription fee
  },
  {
    id: 'launch',
    name: 'Launch',
    price: '$19',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_LAUNCH',
    blurb: 'For a solo services pro validating agent traffic.',
    features: ['3 published pages', 'Agent JSON + llms.txt', 'Directory listing', 'Basic analytics'],
    commissionPercent: 8,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_PRO',
    blurb: 'For teams running services, bookings, and paid offers.',
    features: ['25 published pages', 'Checkout event tracking', 'Agent simulator', 'Integrations workspace'],
    commissionPercent: 8,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '$149',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_SCALE',
    blurb: 'For agencies and operators managing many agent pages.',
    features: ['Unlimited pages', 'Custom domain readiness', 'Advanced analytics', 'Priority setup'],
    commissionPercent: 6,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_ENTERPRISE',
    blurb: 'For large organizations with custom needs and SLAs.',
    features: ['Everything in Scale', 'Dedicated support', 'Custom SLAs', 'White-label options', 'Volume discounts'],
    commissionPercent: 4, // custom in practice, default low
  },
]

export function getBillingPlan(id: string | null | undefined) {
  return billingPlans.find((plan) => plan.id === id)
}

export function getPlanPriceId(plan: BillingPlan) {
  // Support both private (STRIPE_PRICE_*) and public (NEXT_PUBLIC_STRIPE_PRICE_*) for client-side use in embedded UI.
  // Price IDs are safe to expose publicly (they are not secret keys).
  const publicEnvVar = plan.envVar.replace(/^STRIPE_PRICE_/, 'NEXT_PUBLIC_STRIPE_PRICE_');
  return process.env[plan.envVar] || process.env[publicEnvVar] || '';
}

export function getStripeBillingReadiness() {
  const configuredPlans = billingPlans.filter((plan) => Boolean(getPlanPriceId(plan)))
  const missingPlanEnvVars = billingPlans
    .filter((plan) => !getPlanPriceId(plan))
    .map((plan) => plan.envVar)
  const secretKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY)
  const webhookSecretConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  const serviceRoleConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

  return {
    secretKeyConfigured,
    webhookSecretConfigured,
    serviceRoleConfigured,
    configuredPlans,
    missingPlanEnvVars,
    subscriptionCheckoutReady: secretKeyConfigured && configuredPlans.length > 0,
    webhookSyncReady: webhookSecretConfigured && serviceRoleConfigured,
    productionReady: secretKeyConfigured && webhookSecretConfigured && serviceRoleConfigured && missingPlanEnvVars.length === 0,
  }
}

export function isStripeBillingConfigured() {
  return getStripeBillingReadiness().subscriptionCheckoutReady
}
