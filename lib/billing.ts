export type PlanId = 'free' | 'launch' | 'pro' | 'scale' | 'enterprise'
export type SelfServePlanId = Exclude<PlanId, 'free' | 'enterprise'>

export const OWNER_PLAN_ENTITLEMENT_SCHEMA_VERSION = 1 as const

export function isSelfServePlanId(value: unknown): value is SelfServePlanId {
  return value === 'launch' || value === 'pro' || value === 'scale'
}

// Gateable capabilities. Commerce participation is deliberately not represented
// here: operational readiness decides whether a merchant can transact, while a
// subscription controls the leverage, automation, and capacity around commerce.
export const PLAN_FEATURES = [
  'customDomain',
  'aiFeatures', // Merchant AI refinement: private analysis, optimize, credential review, agent memory
  'removeBadge',
  'integrations', // Premium connectors; Stripe payouts + installed Shopify OAuth remain core
  'outboundWebhooks',
  'apiAccess',
  'negotiation', // make-an-offer + smart pricing rules
  'analyticsHistory',
  'teamCollaboration',
  'whiteLabel',
  'prioritySupport',
  'sso',
] as const

export type PlanFeature = (typeof PLAN_FEATURES)[number]

/**
 * Canonical plan × feature contract. Every plan and feature is written out so a
 * review can see the complete allocation and TypeScript fails when either axis is
 * extended without an explicit product decision.
 */
export const PLAN_FEATURE_MATRIX = {
  free: {
    customDomain: false,
    aiFeatures: false,
    removeBadge: false,
    integrations: false,
    outboundWebhooks: false,
    apiAccess: false,
    negotiation: false,
    analyticsHistory: false,
    teamCollaboration: false,
    whiteLabel: false,
    prioritySupport: false,
    sso: false,
  },
  launch: {
    customDomain: true,
    aiFeatures: true,
    removeBadge: true,
    integrations: false,
    outboundWebhooks: false,
    apiAccess: false,
    negotiation: false,
    analyticsHistory: false,
    teamCollaboration: false,
    whiteLabel: true,
    prioritySupport: false,
    sso: false,
  },
  pro: {
    customDomain: true,
    aiFeatures: true,
    removeBadge: true,
    integrations: true,
    outboundWebhooks: true,
    apiAccess: true,
    negotiation: true,
    analyticsHistory: true,
    teamCollaboration: true,
    whiteLabel: true,
    prioritySupport: false,
    sso: false,
  },
  scale: {
    customDomain: true,
    aiFeatures: true,
    removeBadge: true,
    integrations: true,
    outboundWebhooks: true,
    apiAccess: true,
    negotiation: true,
    analyticsHistory: true,
    teamCollaboration: true,
    whiteLabel: true,
    prioritySupport: true,
    sso: false,
  },
  enterprise: {
    customDomain: true,
    aiFeatures: true,
    removeBadge: true,
    integrations: true,
    outboundWebhooks: true,
    apiAccess: true,
    negotiation: true,
    analyticsHistory: true,
    teamCollaboration: true,
    whiteLabel: true,
    prioritySupport: true,
    sso: true,
  },
} as const satisfies Record<PlanId, Record<PlanFeature, boolean>>

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  customDomain: 'Custom domain',
  aiFeatures: 'Merchant AI refinement (private analysis, optimize, credential review)',
  removeBadge: 'Remove Nexez badge',
  integrations: 'Premium integrations (excluding installed Shopify OAuth)',
  outboundWebhooks: 'Outbound webhooks',
  apiAccess: 'API access',
  negotiation: 'Negotiation & smart-pricing rules',
  analyticsHistory: 'Full analytics history',
  teamCollaboration: 'Team collaboration & approvals',
  whiteLabel: 'White-label branding',
  prioritySupport: 'Priority support',
  sso: 'SSO / SAML (sales-assisted)',
}

export const PLAN_LIMITS = ['publishedListings', 'customDomains', 'teamSeats', 'storefronts'] as const
export type PlanLimit = (typeof PLAN_LIMITS)[number]
export type CanonicalPlanLimits = Record<PlanLimit, number>

/** Canonical plan × limit contract. Number.POSITIVE_INFINITY means negotiated/unlimited. */
export const PLAN_LIMIT_MATRIX = {
  free: { publishedListings: 1, customDomains: 0, teamSeats: 0, storefronts: 1 },
  launch: { publishedListings: 3, customDomains: 1, teamSeats: 0, storefronts: 1 },
  pro: { publishedListings: 25, customDomains: 5, teamSeats: 3, storefronts: 3 },
  scale: { publishedListings: 100, customDomains: 25, teamSeats: 10, storefronts: 10 },
  enterprise: {
    publishedListings: Number.POSITIVE_INFINITY,
    customDomains: Number.POSITIVE_INFINITY,
    teamSeats: Number.POSITIVE_INFINITY,
    storefronts: Number.POSITIVE_INFINITY,
  },
} as const satisfies Record<PlanId, CanonicalPlanLimits>

export type PlanLimits = CanonicalPlanLimits & {
  /** @deprecated Use publishedListings. Retained while existing consumers migrate. */
  pages: number
}

/** JSON-safe limits used by server DTOs; null means negotiated/unlimited. */
export type SerializablePlanLimits = Record<PlanLimit, number | null>

function limitsForPlan(id: PlanId): PlanLimits {
  const limits = PLAN_LIMIT_MATRIX[id]
  return { ...limits, pages: limits.publishedListings }
}

export type BillingPlan = {
  id: PlanId
  /** Upgrade ordering + cumulative feature unlocking. Free=0 … Enterprise=4. */
  rank: number
  name: string
  price: string
  /** Self-serve monthly subscription in integer cents; null means negotiated. */
  monthlyPriceCents: number | null
  cadence: string
  envVar: string
  blurb: string
  features: string[]
  limits: PlanLimits
  /**
   * Platform commission % on agent-driven transactions (applied via Stripe
   * Application Fee). It steps DOWN as the plan rank rises, so upgrading both
   * unlocks features AND lowers the transaction take-rate. Free pays the most
   * (no subscription); Enterprise the least. THIS is the single source of truth -
   * the pricing page and billing dashboard render these numbers, and
   * getCommissionPercentForPlan() charges them.
   */
  commissionPercent: number
}

export const BASIS_POINTS_PER_PERCENT = 100
export const BASIS_POINTS_PER_WHOLE = 10_000


export const billingPlans: BillingPlan[] = [
  {
    id: 'free',
    rank: 0,
    name: 'Free',
    price: '$0',
    monthlyPriceCents: 0,
    cadence: 'month',
    envVar: '', // no price for free
    blurb: 'Try Nexez with one agent listing and the core toolkit.',
    features: ['1 published listing', 'agent.json · llms.txt · MCP', 'Directory listing', 'Deterministic simulator', 'Agentic checkout'],
    limits: limitsForPlan('free'),
    commissionPercent: 9, // Free pays the highest commission, no subscription fee
  },
  {
    id: 'launch',
    rank: 1,
    name: 'Launch',
    price: '$19',
    monthlyPriceCents: 1900,
    cadence: 'month',
    envVar: 'STRIPE_PRICE_LAUNCH',
    blurb: 'For a solo pro turning agent traffic into bookings.',
    features: ['3 published listings', 'Custom domain', 'AI refinement & optimization', 'Custom branding', 'Remove Nexez badge'],
    limits: limitsForPlan('launch'),
    commissionPercent: 7,
  },
  {
    id: 'pro',
    rank: 2,
    name: 'Pro',
    price: '$49',
    monthlyPriceCents: 4900,
    cadence: 'month',
    envVar: 'STRIPE_PRICE_PRO',
    blurb: 'For teams running services, bookings, and paid offers.',
    features: ['25 published listings', '3 storefronts', 'Team collaboration (3 seats)', 'Integrations, webhooks & API', 'Negotiation & smart pricing'],
    limits: limitsForPlan('pro'),
    commissionPercent: 5,
  },
  {
    id: 'scale',
    rank: 3,
    name: 'Scale',
    price: '$149',
    monthlyPriceCents: 14900,
    cadence: 'month',
    envVar: 'STRIPE_PRICE_SCALE',
    blurb: 'For agencies and operators managing many agent listings.',
    features: ['100 published listings', '10 storefronts', '10 team seats', '25 custom domains', 'Priority support'],
    limits: limitsForPlan('scale'),
    commissionPercent: 3,
  },
  {
    id: 'enterprise',
    rank: 4,
    name: 'Enterprise',
    price: 'Custom',
    monthlyPriceCents: null,
    cadence: 'month',
    envVar: 'STRIPE_PRICE_ENTERPRISE',
    blurb: 'For large organizations with custom needs and SLAs.',
    features: ['Unlimited listings, storefronts, seats & domains', 'Sales-assisted SSO / SAML', 'Dedicated support & SLAs', 'Volume discounts'],
    limits: limitsForPlan('enterprise'),
    commissionPercent: 2, // custom in practice
  },
]

export function getBillingPlan(id: string | null | undefined): BillingPlan | undefined {
  return billingPlans.find((plan) => plan.id === id)
}

/** The plan to fall back to when none is set / unknown - the Free tier. */
export function defaultPlan(): BillingPlan {
  return billingPlans[0]
}

/** Convert a display percentage to integer basis points for money arithmetic. */
export function commissionPercentToBasisPoints(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return Math.round(percent * BASIS_POINTS_PER_PERCENT)
}

/**
 * Plan-default commission in basis points. Unknown/missing plans intentionally
 * fail closed to Free, which carries the highest standard take rate.
 */
export function getCommissionBpsForPlan(id: string | null | undefined): number {
  const plan = getBillingPlan(id) ?? defaultPlan()
  return commissionPercentToBasisPoints(plan.commissionPercent)
}

export function getPlanRank(id: string | null | undefined): number {
  return getBillingPlan(id)?.rank ?? 0
}

export function getPlanLimits(id: string | null | undefined): PlanLimits {
  return (getBillingPlan(id) ?? defaultPlan()).limits
}

/** JSON-safe limits for API/server DTOs. `null` represents unlimited. */
export function getSerializablePlanLimits(id: string | null | undefined): SerializablePlanLimits {
  const limits = getPlanLimits(id)
  return {
    publishedListings: Number.isFinite(limits.publishedListings) ? limits.publishedListings : null,
    customDomains: Number.isFinite(limits.customDomains) ? limits.customDomains : null,
    teamSeats: Number.isFinite(limits.teamSeats) ? limits.teamSeats : null,
    storefronts: Number.isFinite(limits.storefronts) ? limits.storefronts : null,
  }
}

/** Complete feature decisions for one plan, copied so callers cannot mutate the catalog. */
export function getPlanFeatureEntitlements(id: string | null | undefined): Record<PlanFeature, boolean> {
  const planId = getBillingPlan(id)?.id ?? 'free'
  return { ...PLAN_FEATURE_MATRIX[planId] }
}

/** True when the given plan unlocks `feature`. */
export function planAllows(id: string | null | undefined, feature: PlanFeature): boolean {
  const planId = getBillingPlan(id)?.id ?? 'free'
  return PLAN_FEATURE_MATRIX[planId][feature]
}

/** The lowest-priced plan that unlocks `feature` - used for "Upgrade to X" prompts. */
export function minPlanForFeature(feature: PlanFeature): BillingPlan {
  return billingPlans.find((plan) => PLAN_FEATURE_MATRIX[plan.id][feature]) ?? billingPlans[billingPlans.length - 1]
}

export type FeatureUpgradeDecision = {
  kind: 'feature'
  feature: PlanFeature
  currentPlanId: PlanId
  allowed: boolean
  minimumPlanId: PlanId
  upgradePlanId: PlanId | null
}

/** Shared, serializable decision for feature gates and their upgrade prompts. */
export function getFeatureUpgradeDecision(
  id: string | null | undefined,
  feature: PlanFeature,
): FeatureUpgradeDecision {
  const currentPlanId = getBillingPlan(id)?.id ?? 'free'
  const minimumPlanId = minPlanForFeature(feature).id
  const allowed = planAllows(currentPlanId, feature)
  return {
    kind: 'feature',
    feature,
    currentPlanId,
    allowed,
    minimumPlanId,
    upgradePlanId: allowed ? null : minimumPlanId,
  }
}

export type LimitUpgradeDecision = {
  kind: 'limit'
  limit: PlanLimit
  currentPlanId: PlanId
  currentLimit: number | null
  requestedUsage: number
  allowed: boolean
  minimumPlanId: PlanId
  upgradePlanId: PlanId | null
}

/**
 * Shared, serializable decision for a post-action usage value. The upgrade target
 * is the lowest plan that can actually contain that usage, not merely the next
 * plan in the ladder.
 */
export function getLimitUpgradeDecision(
  id: string | null | undefined,
  limit: PlanLimit,
  requestedUsage: number,
): LimitUpgradeDecision {
  if (!Number.isInteger(requestedUsage) || requestedUsage < 0) {
    throw new RangeError('requestedUsage must be a non-negative integer')
  }

  const currentPlanId = getBillingPlan(id)?.id ?? 'free'
  const currentLimitValue = PLAN_LIMIT_MATRIX[currentPlanId][limit]
  const minimumPlan = billingPlans.find((plan) => PLAN_LIMIT_MATRIX[plan.id][limit] >= requestedUsage)
    ?? billingPlans[billingPlans.length - 1]
  const allowed = currentLimitValue >= requestedUsage

  return {
    kind: 'limit',
    limit,
    currentPlanId,
    currentLimit: Number.isFinite(currentLimitValue) ? currentLimitValue : null,
    requestedUsage,
    allowed,
    minimumPlanId: minimumPlan.id,
    upgradePlanId: allowed ? null : minimumPlan.id,
  }
}

export function getPlanPriceId(plan: BillingPlan) {
  // Support both private (STRIPE_PRICE_*) and public (NEXT_PUBLIC_STRIPE_PRICE_*) for client-side use in embedded UI.
  // Price IDs are safe to expose publicly (they are not secret keys).
  const publicEnvVar = plan.envVar.replace(/^STRIPE_PRICE_/, 'NEXT_PUBLIC_STRIPE_PRICE_');
  return (process.env[plan.envVar] || process.env[publicEnvVar] || '').trim();
}

export function isStripePriceId(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().startsWith('price_')
}

/**
 * A self-serve plan Price must identify exactly one plan. Duplicate environment
 * mappings are unsafe: selecting two different plans would charge the same
 * Stripe Price while metadata asks the webhook to grant different access.
 */
export function isUniqueSelfServePlanPrice(plan: BillingPlan): boolean {
  if (!isSelfServePlanId(plan.id)) return false
  const priceId = getPlanPriceId(plan)
  if (!isStripePriceId(priceId)) return false
  return billingPlans.filter((candidate) => (
    isSelfServePlanId(candidate.id) && getPlanPriceId(candidate) === priceId
  )).length === 1
}

// NOTE: Stripe billing READINESS checks (which read the secret env vars) live in
// lib/server/billing-readiness.ts behind `import 'server-only'`, so this module
// stays client-bundle-safe (it reads only non-secret price IDs). Import
// getStripeBillingReadiness / isStripeBillingConfigured from there.
