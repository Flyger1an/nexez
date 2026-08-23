import type { NegotiationStatus } from '../../../../lib/negotiations'
export type PricingTier = {
  name: string
  price: string
  description?: string
}

export type OfferRules = {
  minPrice?: string
  maxDiscountPercent?: number
  autoAccept?: boolean
  autoAcceptWithinPercent?: number
  minNoticeHours?: number
  blackoutDates?: string[]
  maxBookingsPerWeek?: number
  autoCounter?: boolean
  includedScope?: string
  excludedScope?: string
  maxRevisions?: number
  maxProjectWeeks?: number
  autoSettleMax?: string
}

export type OfferItem = {
  name: string
  description?: string
  price?: string
  url?: string
  tiers?: PricingTier[]
  duration?: string
  serviceArea?: string
  travelFee?: string
  isMobile?: boolean
  source?: string
  metadata?: Record<string, unknown>
  availability?: 'available' | 'limited' | 'sold_out'
  offerType?: 'fixed' | 'negotiable'
  rules?: OfferRules
}

export type FaqItem = {
  question: string
  answer: string
}

export type AgentPage = {
  id: string
  owner_id?: string | null
  name: string
  slug: string
  description: string | null
  website_url: string | null
  cta_url: string | null
  cta_label: string | null
  audience: string | null
  location: string | null
  contact_email: string | null
  industry?: string | null
  products: OfferItem[] | null
  services: OfferItem[] | null
  faqs: FaqItem[] | null
  is_published: boolean
  currency?: string | null
  custom_domain?: string | null
  custom_domain_verified?: boolean | string | null
  branding?: Record<string, unknown> | null
  draft?: Record<string, unknown> | null
  draft_updated_at?: string | null
  mcp_enabled?: boolean
  verification_details?: Record<string, unknown> | null
  next_available?: string | null
  last_booking?: unknown
  llm_opt_in?: boolean
  created_at?: string
  updated_at?: string
}

export type AgentVisit = {
  id: string
  page_id: string
  owner_id: string | null
  slug: string
  path: string
  referrer: string | null
  query: string | null
  user_agent: string | null
  is_ai_agent: boolean
  agent_type: string
  confidence_score: number
  created_at: string
}

export type CheckoutEventType =
  | 'checkout_view'
  | 'checkout_attempt'
  | 'provider_redirect'
  | 'stripe_session_created'
  | 'stripe_missing_config'
  | 'stripe_error'
  | 'stripe_price_sync'
  | 'directory_click'
  | 'agent_page_view'
  | 'ab_impression'

export type CheckoutEvent = {
  id: string
  page_id: string
  owner_id: string | null
  slug: string
  offer_key: string
  offer_name: string
  offer_kind: 'services' | 'products'
  event_type: CheckoutEventType
  agent_user_agent: string | null
  referrer: string | null
  query: string | null
  checkout_url: string | null
  provider_url: string | null
  stripe_session_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type AgentNegotiation = {
  id: string
  page_id: string
  owner_id: string | null
  slug: string
  offer_key: string
  offer_name: string
  offer_kind: 'services' | 'products'
  buyer_agent: string | null
  buyer_query: string | null
  requested_terms: Record<string, unknown> | null
  budget_text: string | null
  timeline_text: string | null
  contact: string | null
  buyer_email: string | null
  status: NegotiationStatus
  amount_cents: number | null
  currency: string
  metadata: Record<string, unknown> | null
  decision_pending?: boolean
  settlement_state?: string | null
  escrow_mode?: string | null
  stripe_payment_intent_id?: string | null
  refunded_cents?: number | null
  created_at: string
  updated_at: string
}

export type CheckoutOrder = {
  id: string
  owner_id: string
  page_id: string | null
  slug: string | null
  offer_name: string | null
  offer_key: string | null
  amount_cents: number
  currency: string
  status: string
  channel?: string | null
  stripe_livemode?: boolean | null
  refunded_cents?: number | null
  buyer_email?: string | null
  buyer_name?: string | null
  buyer_reference?: string | null
  created_at?: string
}

export type AnalyticsRollup = {
  schemaVersion: 1
  counts: {
    events: number
    visits: number
    aiVisits: number
    humanVisits: number
    discoveryClicks: number
    checkoutAttempts: number
    checkoutHandoffs: number
    checkoutStarts: number
    paidOrders: number
    paidDirectOrders: number
    retainedDirectOrders: number
  }
  trust: {
    events: { total: number; verified: number; legacy: number; unverified: number }
    visits: { total: number; verified: number; legacy: number; unverified: number }
  }
  daily: {
    date: string
    eventSignals: number
    visits: number
    aiVisits: number
    discoveryClicks: number
    checkoutStarts: number
    paidOrders: number
  }[]
  channels: { channel: string; orders: number }[]
  currencies: {
    currency: string
    orders: number
    gmvCents: number
    refundedCents: number
    feeCents: number
  }[]
  agentTypes: { agentType: string; visits: number; avgConfidence: number }[]
  topPages: { pageId: string; slug: string; name: string; visits: number }[]
  topOffers: {
    pageId: string
    slug: string
    offerKey: string
    offerName: string
    signals: number
    attempts: number
    paidOrders: number
  }[]
  topQueries: { query: string; uses: number }[]
  topReferrers: { referrer: string; visits: number }[]
  activePageIds: string[]
}

export type FinanceRollup = {
  schemaVersion: 1
  currencies: {
    currency: string
    transactions: number
    grossCents: number
    retainedGrossCents: number
    refundCents: number
    disputeCents: number
    outflowCents: number
    feeCents: number
    netCents: number
    aovCents: number
    partialRefunds: number
    snapshotTransactions: number
    estimatedTransactions: number
  }[]
  channels: { currency: string; channel: string; transactions: number; grossCents: number; netCents: number }[]
  daily: { currency: string; date: string; transactions: number; grossCents: number; outflowCents: number; netCents: number }[]
  topOffers: { currency: string; pageId: string | null; slug: string; offerKey: string; offerName: string; transactions: number; grossCents: number; netCents: number }[]
  escrow: {
    currency: string
    deals: number
    fundedCents: number
    heldCents: number
    capturedCents: number
    refundCents: number
    disputeCents: number
    outflowCents: number
    feeCents: number
    netCents: number
    partialRefunds: number
    snapshotDeals: number
    estimatedDeals: number
  }[]
  negotiatedWindow: { currency: string; deals: number; fundedCents: number; heldCents: number; capturedCents: number; outflowCents: number; netCents: number }[]
  operations: { openRequests: number; disputedOrders: number; disputedNegotiations: number; heldNegotiations: number; staleHeldNegotiations: number; estimatedEconomics: number }
}

export type OrderReview = {
  id: string
  order_kind: 'checkout' | 'negotiation'
  order_id: string
  owner_id: string
  page_id: string | null
  slug: string | null
  offer_name: string | null
  rating: number
  title: string | null
  body: string | null
  tags: string[] | unknown
  status: string
  created_at: string
}

export type BuyerRequest = {
  id: string
  order_kind: 'checkout' | 'negotiation'
  order_id: string
  kind: 'refund_request' | 'problem_report'
  status: string
  message: string | null
  buyer_email: string | null
  slug: string | null
  created_at: string
}

export type BillingSubscription = {
  owner_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  plan_id: 'free' | 'launch' | 'pro' | 'scale' | 'enterprise' | null
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  metadata: Record<string, unknown> | null
  stripe_connect_account_id?: string | null
  stripe_connect_status?: string | null
  stripe_connect_details_submitted?: boolean | null
  stripe_connect_charges_enabled?: boolean | null
  stripe_connect_payouts_enabled?: boolean | null
  commission_percent?: number | null
}

export type PlanId = 'free' | 'launch' | 'pro' | 'scale' | 'enterprise'

export type OwnerPlanEntitlements = {
  schemaVersion: 1
  evaluatedAt: string
  ownerId: string
  featurePlanId: PlanId
  featurePlanRank: number
  featurePlanSource: 'admin' | 'subscription' | 'promotion' | 'free'
  commercialPlanId: PlanId
  commercialPlanRank: number
  commercialPlanSource: 'subscription' | 'promotion' | 'free'
  billing: {
    chosenPlanId: PlanId | null
    status: string | null
    confers: boolean
    trialEndsAt: string | null
  }
  promotion: null | {
    id: string
    planId: PlanId
    source: 'welcome' | 'referral' | 'admin'
    startsAt: string
    endsAt: string
  }
  /** Null is the wire representation for an unlimited Enterprise limit. */
  limits: {
    listings: number | null
    customDomains: number | null
    teamSeats: number | null
    storefronts: number | null
  }
  features: {
    customDomain: boolean
    aiFeatures: boolean
    removeBadge: boolean
    whiteLabel: boolean
    integrations: boolean
    outboundWebhooks: boolean
    apiAccess: boolean
    negotiation: boolean
    analyticsHistory: boolean
    teamCollaboration: boolean
    prioritySupport: boolean
    sso: boolean
  }
  commissionBps: number
  commissionSource: 'plan_default' | 'promotion' | 'enterprise_override'
}

export type ActivityItem = {
  id: string
  title: string
  detail: string
  tone: 'info' | 'success' | 'warn' | 'muted'
  createdAt: string
}

export type SellerOverview = {
  pages: AgentPage[]
  publishedCount: number
  totalPages: number
  agentVisits: number
  humanVisits: number
  conversions: number
  checkoutAttempts: number
  openNegotiations: number
  openBuyerRequests: number
  openDisputes: number
  staleHolds: number
  estimatedEconomics: number
  averageReadiness: number
  readinessAlerts: AgentPage[]
  recentActivity: ActivityItem[]
  pipelineCents: number
  payoutsCents: number
  financeCurrency: string
  spark: number[]
}

export type SimulationResult = {
  success?: boolean
  query?: string
  naturalLanguage?: string
  readiness?: number
  confidence?: number
  recommendations?: string[]
  schema?: Record<string, unknown>
  llmEnhanced?: boolean
  error?: string
}
