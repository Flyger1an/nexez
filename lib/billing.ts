export type PlanId = 'free' | 'launch' | 'pro' | 'scale' | 'enterprise'

// Gateable capabilities. A feature unlocks at a minimum plan RANK (see
// FEATURE_MIN_RANK) and is cumulative — every higher tier inherits it. Add a new
// capability here + one line in FEATURE_MIN_RANK/FEATURE_LABELS and it's gated
// everywhere via planAllows().
export const PLAN_FEATURES = [
  'customDomain',
  'aiFeatures', // LLM-enhanced simulator, AI optimize, credential review, agent memory
  'removeBadge',
  'integrations', // Calendly / Stripe / Shopify / Square import + sync
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

/** Minimum plan rank that unlocks each feature. Free=0, Launch=1, Pro=2, Scale=3, Enterprise=4. */
const FEATURE_MIN_RANK: Record<PlanFeature, number> = {
  customDomain: 1,
  aiFeatures: 1,
  removeBadge: 1,
  integrations: 2,
  outboundWebhooks: 2,
  apiAccess: 2,
  negotiation: 2,
  analyticsHistory: 2,
  teamCollaboration: 3,
  whiteLabel: 3,
  prioritySupport: 3,
  sso: 4,
}

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  customDomain: 'Custom domain',
  aiFeatures: 'AI features (LLM simulator, optimize, credential review)',
  removeBadge: 'Remove Nexez badge',
  integrations: 'Integrations (Calendly, Stripe, Shopify, Square)',
  outboundWebhooks: 'Outbound webhooks',
  apiAccess: 'API access',
  negotiation: 'Negotiation & smart-pricing rules',
  analyticsHistory: 'Full analytics history',
  teamCollaboration: 'Team collaboration & approvals',
  whiteLabel: 'White-label branding',
  prioritySupport: 'Priority support',
  sso: 'SSO / SAML',
}

export type PlanLimits = {
  /** Max published pages. Use Number.POSITIVE_INFINITY for unlimited. */
  pages: number
  /** Max verified custom domains. */
  customDomains: number
}

export type BillingPlan = {
  id: PlanId
  /** Upgrade ordering + cumulative feature unlocking. Free=0 … Enterprise=4. */
  rank: number
  name: string
  price: string
  cadence: string
  envVar: string
  blurb: string
  features: string[]
  limits: PlanLimits
  /**
   * Platform commission % on agent-driven transactions (applied via Stripe
   * Application Fee). It steps DOWN as the plan rank rises, so upgrading both
   * unlocks features AND lowers the transaction take-rate. Free pays the most
   * (no subscription); Enterprise the least. THIS is the single source of truth —
   * the pricing page and billing dashboard render these numbers, and
   * getCommissionPercentForPlan() charges them.
   */
  commissionPercent: number
}

const UNLIMITED = Number.POSITIVE_INFINITY

export const billingPlans: BillingPlan[] = [
  {
    id: 'free',
    rank: 0,
    name: 'Free',
    price: '$0',
    cadence: 'month',
    envVar: '', // no price for free
    blurb: 'Try Nexez with one agent page and the core toolkit.',
    features: ['1 published page', 'agent.json · llms.txt · MCP', 'Directory listing', 'Deterministic simulator'],
    limits: { pages: 1, customDomains: 0 },
    commissionPercent: 15, // Free pays the highest commission, no subscription fee
  },
  {
    id: 'launch',
    rank: 1,
    name: 'Launch',
    price: '$19',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_LAUNCH',
    blurb: 'For a solo pro turning agent traffic into bookings.',
    features: ['3 published pages', 'Custom domain', 'AI simulator & optimize', 'Remove Nexez badge'],
    limits: { pages: 3, customDomains: 1 },
    commissionPercent: 8,
  },
  {
    id: 'pro',
    rank: 2,
    name: 'Pro',
    price: '$49',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_PRO',
    blurb: 'For teams running services, bookings, and paid offers.',
    features: ['25 published pages', 'Integrations & webhooks', 'API access', 'Negotiation & smart pricing'],
    limits: { pages: 25, customDomains: 5 },
    commissionPercent: 6,
  },
  {
    id: 'scale',
    rank: 3,
    name: 'Scale',
    price: '$149',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_SCALE',
    blurb: 'For agencies and operators managing many agent pages.',
    features: ['100 published pages', 'Team collaboration', 'White-label branding', 'Priority support'],
    limits: { pages: 100, customDomains: 25 },
    commissionPercent: 4,
  },
  {
    id: 'enterprise',
    rank: 4,
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'month',
    envVar: 'STRIPE_PRICE_ENTERPRISE',
    blurb: 'For large organizations with custom needs and SLAs.',
    features: ['Unlimited pages', 'SSO / SAML', 'Dedicated support & SLAs', 'Volume discounts'],
    limits: { pages: UNLIMITED, customDomains: UNLIMITED },
    commissionPercent: 2, // custom in practice
  },
]

export function getBillingPlan(id: string | null | undefined): BillingPlan | undefined {
  return billingPlans.find((plan) => plan.id === id)
}

/** The plan to fall back to when none is set / unknown — the Free tier. */
export function defaultPlan(): BillingPlan {
  return billingPlans[0]
}

export function getPlanRank(id: string | null | undefined): number {
  return getBillingPlan(id)?.rank ?? 0
}

export function getPlanLimits(id: string | null | undefined): PlanLimits {
  return (getBillingPlan(id) ?? defaultPlan()).limits
}

/** True when the given plan unlocks `feature` (cumulative by rank). */
export function planAllows(id: string | null | undefined, feature: PlanFeature): boolean {
  return getPlanRank(id) >= FEATURE_MIN_RANK[feature]
}

/** The lowest-priced plan that unlocks `feature` — used for "Upgrade to X" prompts. */
export function minPlanForFeature(feature: PlanFeature): BillingPlan {
  const minRank = FEATURE_MIN_RANK[feature]
  return billingPlans.find((p) => p.rank >= minRank) ?? billingPlans[billingPlans.length - 1]
}

/** Human label for a page limit (handles the unlimited sentinel). */
export function formatLimit(value: number): string {
  return Number.isFinite(value) ? String(value) : 'Unlimited'
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

// NOTE: Stripe billing READINESS checks (which read the secret env vars) live in
// lib/server/billing-readiness.ts behind `import 'server-only'`, so this module
// stays client-bundle-safe (it reads only non-secret price IDs). Import
// getStripeBillingReadiness / isStripeBillingConfigured from there.
