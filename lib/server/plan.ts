import type { SupabaseClient } from '@supabase/supabase-js'
import { getCommissionBpsForPlan, getPlanRank, planAllows, type PlanFeature, type PlanId } from '../billing'

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
  id: string
  campaign_id: string
  plan_id: string
  source: string
  starts_at: string
  ends_at: string
  fallback_page_id: string | null
}

function normalizeGrant(row: PromotionalPlanGrantRow | null | undefined): PromotionalPlanGrant | null {
  if (!row?.plan_id || !VALID_PLANS.has(row.plan_id as PlanId) || row.plan_id === 'free') return null
  if (new Date(row.starts_at).getTime() > Date.now() || new Date(row.ends_at).getTime() <= Date.now()) return null
  if (row.source !== 'welcome' && row.source !== 'referral' && row.source !== 'admin') return null
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

/**
 * Does this subscription row CONFER its plan right now? active/past_due/unpaid always do.
 * GRACE POLICY (intentional): past_due/unpaid retain access + the plan commission rate
 * through Stripe's dunning window, so a transient payment failure does not instantly
 * downgrade a paying customer. A 'trialing' row confers only while it's inside its window -
 * an expired no-card trial (trial_ends_at in the past) does NOT, so the account falls
 * back to Free or an active promotion. 'paused'/'expired'/'canceled'/'incomplete'
 * never confer. MUST mirror the SQL
 * conferring predicate in 20260627007400 (owner_plan_rank / plan_published_page_limit).
 */
export function subscriptionConfers(status: string | null | undefined, trialEndsAt: string | null | undefined): boolean {
  if (status === 'trialing') {
    return !trialEndsAt || new Date(trialEndsAt).getTime() >= Date.now()
  }
  return status === 'active' || status === 'past_due' || status === 'unpaid'
}

/**
 * Resolve an owner's effective plan id, server-side, from paid billing plus any
 * active promotional entitlement. Stripe remains the paid source of truth; grants
 * are additive and the higher-ranked live entitlement wins.
 * The single source the gating surfaces read so the "what plan is this user on"
 * decision never drifts. Defaults to 'free' (no/invalid/inactive subscription).
 *
 * Pass any Supabase client that can read the owner's billing_subscriptions row
 * (the authed server client for the owner's own pages, or the admin client when
 * resolving another page's owner - e.g. badge/white-label gating on a public page).
 */
export async function getOwnerPlanId(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<PlanId> {
  if (!ownerId) return 'free'
  try {
    // Resolve admin status + subscription + promotion in parallel. A platform admin gets the TOP
    // tier everywhere (ENTITLEMENTS only - not an RLS/cross-tenant bypass), mirroring
    // the SQL owner_plan_rank()/plan_published_page_limit() admin short-circuit.
    // supabase-js surfaces query errors in `.error` (no throw), so a missing
    // platform_admins table (e.g. pre-migration) just yields null → billing still
    // resolves normally and gating never breaks.
    const now = new Date().toISOString()
    const [adminRes, subRes, grantRes] = await Promise.all([
      supabase.from('platform_admins').select('user_id').eq('user_id', ownerId).maybeSingle<{ user_id: string }>(),
      supabase
        .from('billing_subscriptions')
        .select('plan_id, status, trial_ends_at')
        .eq('owner_id', ownerId)
        .maybeSingle<{ plan_id: string | null; status: string | null; trial_ends_at: string | null }>(),
      supabase
        .from('promotional_plan_grants')
        .select('id, campaign_id, plan_id, source, starts_at, ends_at, fallback_page_id')
        .eq('owner_id', ownerId)
        .eq('status', 'active')
        .lte('starts_at', now)
        .gt('ends_at', now)
        .order('ends_at', { ascending: false })
        .limit(1)
        .maybeSingle<PromotionalPlanGrantRow>(),
    ])
    if (adminRes.data) return 'enterprise'
    const sub = subRes.data
    const subscriptionPlan =
      sub?.plan_id && VALID_PLANS.has(sub.plan_id as PlanId) && subscriptionConfers(sub.status, sub.trial_ends_at)
        ? (sub.plan_id as PlanId)
        : 'free'
    const grantPlan = normalizeGrant(grantRes.data)?.planId ?? 'free'
    return getPlanRank(grantPlan) > getPlanRank(subscriptionPlan) ? grantPlan : subscriptionPlan
  } catch {
    // fall through to free on any read error - gating fails safe (most restrictive)
  }
  return 'free'
}

export type CommissionResolution = {
  planId: PlanId
  percent: number
  basisPoints: number
  source: 'plan_default' | 'enterprise_override' | 'promotion'
}

/**
 * Resolve the commission attached to an owner's EFFECTIVE plan. This deliberately
 * composes getOwnerPlanId() rather than re-reading billing state, so dunning,
 * expired trials, promotions, admins, and fail-safe Free fallback cannot drift
 * between feature entitlement and transaction economics.
 *
 * Enterprise owners may receive a server-controlled override. Missing, inactive,
 * unreadable, or out-of-policy terms fail closed to the Enterprise plan default.
 */
export async function getOwnerCommission(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<CommissionResolution> {
  const planId = await getOwnerPlanId(supabase, ownerId)
  const planDefaultBps = getCommissionBpsForPlan(planId)

  // Only effective Enterprise owners are eligible for negotiated commercial
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
    source: 'plan_default',
  }
}

export type OwnerBillingState = {
  /** Entitled tier RIGHT NOW (Free when not conferring) - drives feature gating. */
  planId: PlanId
  /** The plan_id on the row, even when paused - for "your {Pro} trial" display copy. */
  chosenPlanId: PlanId | null
  status: string | null
  /** A conferring sub (active/dunning/in-window trial). */
  isLive: boolean
  /** In-window trial. */
  isTrialing: boolean
  /** The old all-or-nothing pause state is retained for compatibility but is now
   * always false. Billing lapses fall back to the usable Free plan. */
  isPaused: boolean
  /** A no-card paid-plan trial ended and the account fell back to Free/a grant. */
  isTrialExpired: boolean
  trialEndsAt: string | null
  origin: string | null
  promotion: PromotionalPlanGrant | null
}

/**
 * Richer billing state for the dashboard (trial countdown, promotion, and Free
 * fallback). Splits the tier used for gating from the billing lifecycle. A read
 * error returns a neutral Free state; billing state never takes public listings
 * offline.
 */
export async function getOwnerBillingState(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<OwnerBillingState> {
  const neutral: OwnerBillingState = {
    planId: 'free', chosenPlanId: null, status: null,
    isLive: false, isTrialing: false, isPaused: false, isTrialExpired: false,
    trialEndsAt: null, origin: null, promotion: null,
  }
  if (!ownerId) return neutral
  try {
    const now = new Date().toISOString()
    const [adminRes, subRes, grantRes] = await Promise.all([
      supabase.from('platform_admins').select('user_id').eq('user_id', ownerId).maybeSingle<{ user_id: string }>(),
      supabase
        .from('billing_subscriptions')
        .select('plan_id, status, trial_ends_at, account_origin')
        .eq('owner_id', ownerId)
        .maybeSingle<{ plan_id: string | null; status: string | null; trial_ends_at: string | null; account_origin: string | null }>(),
      supabase
        .from('promotional_plan_grants')
        .select('id, campaign_id, plan_id, source, starts_at, ends_at, fallback_page_id')
        .eq('owner_id', ownerId)
        .eq('status', 'active')
        .lte('starts_at', now)
        .gt('ends_at', now)
        .order('ends_at', { ascending: false })
        .limit(1)
        .maybeSingle<PromotionalPlanGrantRow>(),
    ])
    if (adminRes.data) return { ...neutral, planId: 'enterprise', isLive: true }
    const sub = subRes.data
    const promotion = normalizeGrant(grantRes.data)
    const chosen = sub?.plan_id && VALID_PLANS.has(sub.plan_id as PlanId) ? (sub.plan_id as PlanId) : null
    const conferring = subscriptionConfers(sub?.status, sub?.trial_ends_at)
    const subscriptionPlan = conferring && chosen ? chosen : 'free'
    const promotionPlan = promotion?.planId ?? 'free'
    const planId = getPlanRank(promotionPlan) > getPlanRank(subscriptionPlan) ? promotionPlan : subscriptionPlan
    const trialing = sub?.status === 'trialing' && conferring
    const trialExpired =
      sub?.account_origin === 'trial'
      && ((sub.status === 'trialing' && !conferring) || sub.status === 'paused' || sub.status === 'expired')
    return {
      planId,
      chosenPlanId: chosen,
      status: sub?.status ?? null,
      isLive: conferring || Boolean(promotion),
      isTrialing: trialing,
      isPaused: false,
      isTrialExpired: trialExpired,
      trialEndsAt: sub?.trial_ends_at ?? null,
      origin: sub?.account_origin ?? null,
      promotion,
    }
  } catch {
    return neutral
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
    const { data } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', ownerId)
      .maybeSingle<{ user_id: string }>()
    return Boolean(data)
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
