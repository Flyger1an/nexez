import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getCommissionBpsForPlan,
  getPlanFeatureEntitlements,
  getPlanRank,
  getSerializablePlanLimits,
  planAllows,
  type PlanFeature,
  type PlanId,
  type SerializablePlanLimits,
} from '../billing'

// A subscription only confers its plan when it's in a conferring state; an
// abandoned 'incomplete' or 'canceled' row falls back to Free. subscriptionConfers
// below is the SINGLE source of truth for "is this owner entitled to their plan",
// shared by entitlements (getOwnerPlanId → gating), the transaction commission
// (checkout + pay routes), and the billing dashboard guard.
const VALID_PLANS = new Set<PlanId>(['free', 'launch', 'pro', 'scale', 'enterprise'])

export type PromotionalPlanGrant = {
  id: string
  campaignId: string
  planId: PlanId
  source: 'welcome' | 'referral' | 'admin'
  startsAt: string
  endsAt: string
  fallbackPageId: string | null
}

type PromotionalPlanGrantRow = {
  owner_id?: string | null
  id: string
  campaign_id: string
  plan_id: string
  source: string
  starts_at: string
  ends_at: string
  fallback_page_id: string | null
}

type SubscriptionRow = {
  owner_id?: string | null
  plan_id: string | null
  status: string | null
  trial_ends_at: string | null
  account_origin?: string | null
}

type AdminRow = { user_id: string }
export type OwnerEntitlementSource = 'free' | 'subscription' | 'promotion' | 'admin_override'

type ResolvedOwnerPlan = {
  entitlementPlanId: PlanId
  commercialPlanId: PlanId
  source: OwnerEntitlementSource
  adminOverride: boolean
  subscription: SubscriptionRow | null
  promotion: PromotionalPlanGrant | null
}

function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && VALID_PLANS.has(value as PlanId)
}

function asRows<T>(data: T | T[] | null | undefined): T[] {
  if (Array.isArray(data)) return data
  return data ? [data] : []
}

function normalizeGrant(
  row: PromotionalPlanGrantRow | null | undefined,
  nowMs: number,
): PromotionalPlanGrant | null {
  if (!row || !isPlanId(row.plan_id) || row.plan_id === 'free') return null
  if (row.source !== 'welcome' && row.source !== 'referral' && row.source !== 'admin') return null

  const startsAtMs = Date.parse(row.starts_at)
  const endsAtMs = Date.parse(row.ends_at)
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) return null
  if (startsAtMs > nowMs || endsAtMs <= nowMs) return null

  return {
    id: row.id,
    campaignId: row.campaign_id,
    planId: row.plan_id as PlanId,
    source: row.source,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    fallbackPageId: row.fallback_page_id,
  }
}

/** Highest plan rank wins; a later expiry deterministically breaks rank ties. */
function bestPromotionalGrant(
  rows: PromotionalPlanGrantRow[],
  nowMs: number,
): PromotionalPlanGrant | null {
  const live = rows
    .map((row) => normalizeGrant(row, nowMs))
    .filter((grant): grant is PromotionalPlanGrant => Boolean(grant))

  live.sort((left, right) => (
    getPlanRank(right.planId) - getPlanRank(left.planId)
    || Date.parse(right.endsAt) - Date.parse(left.endsAt)
    || left.id.localeCompare(right.id)
  ))
  return live[0] ?? null
}

/**
 * Does this subscription row CONFER its plan right now? active/past_due/unpaid always do.
 * GRACE POLICY (intentional): past_due/unpaid retain access + the plan commission rate
 * through Stripe's dunning window, so a transient payment failure does not instantly
 * downgrade a paying customer. A 'trialing' row confers only while it has a finite,
 * unexpired window -
 * an expired no-card trial (trial_ends_at in the past) does NOT, so the account falls
 * back to Free or an active promotion. 'paused'/'expired'/'canceled'/'incomplete'
 * never confer. MUST mirror the canonical SQL entitlement resolver and quota
 * helpers in the plan-entitlement migration.
 */
export function subscriptionConfers(status: string | null | undefined, trialEndsAt: string | null | undefined): boolean {
  if (status === 'trialing') {
    if (!trialEndsAt) return false
    const endsAt = new Date(trialEndsAt).getTime()
    // SQL uses a half-open validity window (`now() < trial_ends_at`). Keep the
    // application resolver exact at the boundary so a trial is no longer
    // entitled at the instant its expiry timestamp is reached.
    return Number.isFinite(endsAt) && endsAt > Date.now()
  }
  return status === 'active' || status === 'past_due' || status === 'unpaid'
}

function subscriptionPlan(row: SubscriptionRow | null | undefined): PlanId {
  return row?.plan_id && isPlanId(row.plan_id) && subscriptionConfers(row.status, row.trial_ends_at)
    ? row.plan_id
    : 'free'
}

function resolveOwnerPlan(
  adminOverride: boolean,
  subscription: SubscriptionRow | null | undefined,
  grantRows: PromotionalPlanGrantRow[],
  nowMs: number,
): ResolvedOwnerPlan {
  const paidPlanId = subscriptionPlan(subscription)
  const promotion = bestPromotionalGrant(grantRows, nowMs)
  const promotionWins = Boolean(
    promotion && getPlanRank(promotion.planId) > getPlanRank(paidPlanId),
  )
  const commercialPlanId = promotionWins && promotion ? promotion.planId : paidPlanId

  return {
    entitlementPlanId: adminOverride ? 'enterprise' : commercialPlanId,
    commercialPlanId,
    source: adminOverride
      ? 'admin_override'
      : promotionWins
        ? 'promotion'
        : commercialPlanId === 'free'
          ? 'free'
          : 'subscription',
    adminOverride,
    subscription: subscription ?? null,
    promotion,
  }
}

function neutralResolution(): ResolvedOwnerPlan {
  return resolveOwnerPlan(false, null, [], Date.now())
}

async function readOwnerPlanResolution(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<ResolvedOwnerPlan> {
  if (!ownerId) return neutralResolution()

  try {
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const [adminRes, subRes, grantRes] = await Promise.all([
      supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', ownerId)
        .maybeSingle<AdminRow>(),
      supabase
        .from('billing_subscriptions')
        .select('owner_id, plan_id, status, trial_ends_at, account_origin')
        .eq('owner_id', ownerId)
        .maybeSingle<SubscriptionRow>(),
      supabase
        .from('promotional_plan_grants')
        .select('owner_id, id, campaign_id, plan_id, source, starts_at, ends_at, fallback_page_id')
        .eq('owner_id', ownerId)
        .eq('status', 'active')
        .lte('starts_at', now)
        .gt('ends_at', now)
        .order('ends_at', { ascending: false }),
    ])

    const adminOverride = !adminRes.error && Boolean(adminRes.data)
    const subscription = !subRes.error ? subRes.data : null
    const grantRows = !grantRes.error
      ? asRows(grantRes.data as PromotionalPlanGrantRow[] | PromotionalPlanGrantRow | null)
      : []
    return resolveOwnerPlan(adminOverride, subscription, grantRows, nowMs)
  } catch {
    return neutralResolution()
  }
}

/**
 * Compatibility wrapper: this is the feature-entitlement plan, including the
 * platform-admin override. Commission code must use commercialPlanId instead.
 */
export async function getOwnerPlanId(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<PlanId> {
  return (await readOwnerPlanResolution(supabase, ownerId)).entitlementPlanId
}

export type OwnerEntitlements = {
  ownerId: string | null
  planId: PlanId
  commercialPlanId: PlanId
  source: OwnerEntitlementSource
  adminOverride: boolean
  promotion: PromotionalPlanGrant | null
  features: Record<PlanFeature, boolean>
  limits: SerializablePlanLimits
}

/** Complete JSON-safe entitlement DTO for server components and API responses. */
export async function getOwnerEntitlements(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<OwnerEntitlements> {
  const resolution = await readOwnerPlanResolution(supabase, ownerId)
  return {
    ownerId: ownerId ?? null,
    planId: resolution.entitlementPlanId,
    commercialPlanId: resolution.commercialPlanId,
    source: resolution.source,
    adminOverride: resolution.adminOverride,
    promotion: resolution.promotion,
    features: getPlanFeatureEntitlements(resolution.entitlementPlanId),
    limits: getSerializablePlanLimits(resolution.entitlementPlanId),
  }
}

/**
 * Resolve feature-entitlement plans for many owners with exactly three reads:
 * admins, subscriptions, and all live grants. Missing/erroring data fails to Free.
 */
export async function getOwnerPlanIds(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerIds: readonly string[],
): Promise<Record<string, PlanId>> {
  const ids = [...new Set(ownerIds.filter(Boolean))]
  const fallback = Object.fromEntries(ids.map((ownerId) => [ownerId, 'free' as PlanId]))
  if (ids.length === 0) return fallback

  try {
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const [adminRes, subRes, grantRes] = await Promise.all([
      supabase.from('platform_admins').select('user_id').in('user_id', ids),
      supabase
        .from('billing_subscriptions')
        .select('owner_id, plan_id, status, trial_ends_at, account_origin')
        .in('owner_id', ids),
      supabase
        .from('promotional_plan_grants')
        .select('owner_id, id, campaign_id, plan_id, source, starts_at, ends_at, fallback_page_id')
        .in('owner_id', ids)
        .eq('status', 'active')
        .lte('starts_at', now)
        .gt('ends_at', now)
        .order('ends_at', { ascending: false }),
    ])

    const adminIds = new Set(
      (!adminRes.error ? asRows(adminRes.data as AdminRow[] | AdminRow | null) : [])
        .map((row) => row.user_id),
    )
    const subscriptionsByOwner = new Map<string, SubscriptionRow>()
    for (const row of !subRes.error ? asRows(subRes.data as SubscriptionRow[] | SubscriptionRow | null) : []) {
      if (row.owner_id && ids.includes(row.owner_id)) subscriptionsByOwner.set(row.owner_id, row)
    }
    const grantsByOwner = new Map<string, PromotionalPlanGrantRow[]>()
    for (const row of !grantRes.error
      ? asRows(grantRes.data as PromotionalPlanGrantRow[] | PromotionalPlanGrantRow | null)
      : []) {
      if (!row.owner_id || !ids.includes(row.owner_id)) continue
      grantsByOwner.set(row.owner_id, [...(grantsByOwner.get(row.owner_id) ?? []), row])
    }

    return Object.fromEntries(ids.map((ownerId) => {
      const resolution = resolveOwnerPlan(
        adminIds.has(ownerId),
        subscriptionsByOwner.get(ownerId),
        grantsByOwner.get(ownerId) ?? [],
        nowMs,
      )
      return [ownerId, resolution.entitlementPlanId]
    }))
  } catch {
    return fallback
  }
}

export type CommissionResolution = {
  planId: PlanId
  percent: number
  basisPoints: number
  source: 'plan_default' | 'enterprise_override' | 'promotion'
}

/**
 * Resolve commission from the commercial plan only. Platform-admin authorization
 * can unlock product features but can never silently change transaction terms.
 */
export async function getOwnerCommission(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
  resolvedBillingState?: OwnerBillingState,
): Promise<CommissionResolution> {
  const billingState = resolvedBillingState ?? await getOwnerBillingState(supabase, ownerId)
  const subscriptionPlanId =
    billingState.chosenPlanId && subscriptionConfers(billingState.status, billingState.trialEndsAt)
      ? billingState.chosenPlanId
      : 'free'
  const promotionWins = Boolean(
    billingState.promotion
    && getPlanRank(billingState.promotion.planId) > getPlanRank(subscriptionPlanId),
  )
  const planId = billingState.commercialPlanId
  const planDefaultBps = getCommissionBpsForPlan(planId)
  const defaultSource: CommissionResolution['source'] = promotionWins ? 'promotion' : 'plan_default'

  // Only commercial Enterprise owners are eligible for negotiated commercial
  // terms. Non-Enterprise plans never touch the commercial-terms table.
  if (planId === 'enterprise' && ownerId) {
    try {
      const query = supabase
        .from('owner_commercial_terms')
        .select('commission_bps,effective_from,effective_until')
        .eq('owner_id', ownerId)

      const { data, error } = await query.maybeSingle()

      if (!error && data) {
        const commissionBps = Number(data.commission_bps)
        const startsAtMs = Date.parse(String(data.effective_from ?? ''))
        const endsAtMs =
          data.effective_until == null
            ? Number.POSITIVE_INFINITY
            : Date.parse(String(data.effective_until))
        const nowMs = Date.now()

        const validRate =
          Number.isInteger(commissionBps) &&
          commissionBps >= 100 &&
          commissionBps <= 200
        const activeWindow =
          Number.isFinite(startsAtMs) &&
          startsAtMs <= nowMs &&
          (data.effective_until == null ||
            (Number.isFinite(endsAtMs) && endsAtMs > nowMs))

        if (validRate && activeWindow) {
          return {
            planId,
            percent: commissionBps / 100,
            basisPoints: commissionBps,
            source: 'enterprise_override',
          }
        }
      }
    } catch {
      // Commercial-term reads fail closed to the Enterprise plan default.
    }
  }

  return {
    planId,
    percent: planDefaultBps / 100,
    basisPoints: planDefaultBps,
    source: defaultSource,
  }
}

export type OwnerBillingState = {
  /** Feature-entitlement tier right now; includes the admin override. */
  planId: PlanId
  /** Commercial tier used for commission; never includes the admin override. */
  commercialPlanId: PlanId
  /** The plan_id on the row, even when paused, for billing lifecycle copy. */
  chosenPlanId: PlanId | null
  status: string | null
  isLive: boolean
  isTrialing: boolean
  isPaused: boolean
  isTrialExpired: boolean
  isAdminOverride: boolean
  trialEndsAt: string | null
  origin: string | null
  promotion: PromotionalPlanGrant | null
}

/** Fail-safe reporting fallback when privileged commercial-term reads are not
 * available. It deliberately keys off the commercial plan, never the feature
 * plan (which may contain a platform-admin Enterprise override). */
export function getCommercialPlanDefaultCommission(
  billingState: Pick<OwnerBillingState, 'commercialPlanId'>,
): CommissionResolution {
  const basisPoints = getCommissionBpsForPlan(billingState.commercialPlanId)
  return {
    planId: billingState.commercialPlanId,
    basisPoints,
    percent: basisPoints / 100,
    source: 'plan_default',
  }
}

/** Rich billing lifecycle plus separated entitlement and commercial plans. */
export async function getOwnerBillingState(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<OwnerBillingState> {
  const resolution = await readOwnerPlanResolution(supabase, ownerId)
  const sub = resolution.subscription
  const chosen = isPlanId(sub?.plan_id) ? sub.plan_id : null
  const conferring = subscriptionConfers(sub?.status, sub?.trial_ends_at)
  const trialing = sub?.status === 'trialing' && conferring
  const trialExpired = Boolean(
    sub?.account_origin === 'trial'
    && ((sub.status === 'trialing' && !conferring) || sub.status === 'paused' || sub.status === 'expired'),
  )

  return {
    planId: resolution.entitlementPlanId,
    commercialPlanId: resolution.commercialPlanId,
    chosenPlanId: chosen,
    status: sub?.status ?? null,
    isLive: resolution.adminOverride || conferring || Boolean(resolution.promotion),
    isTrialing: trialing,
    isPaused: false,
    isTrialExpired: trialExpired,
    isAdminOverride: resolution.adminOverride,
    trialEndsAt: sub?.trial_ends_at ?? null,
    origin: sub?.account_origin ?? null,
    promotion: resolution.promotion,
  }
}

/** True when `ownerId` is a platform admin (entitlements god-mode). Reads
 *  platform_admins (own row under RLS, or any row via the admin client). Best-effort. */
export async function isPlatformAdmin(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<boolean> {
  if (!ownerId) return false
  try {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', ownerId)
      .maybeSingle<AdminRow>()
    return !error && Boolean(data)
  } catch {
    return false
  }
}

/** True when `ownerId`'s plan unlocks `feature`. Server-side enforcement helper. */
export async function ownerAllows(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
  feature: PlanFeature,
): Promise<boolean> {
  return planAllows(await getOwnerPlanId(supabase, ownerId), feature)
}
