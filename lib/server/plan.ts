import type { SupabaseClient } from '@supabase/supabase-js'
import { planAllows, type PlanFeature, type PlanId } from '../billing'

// A subscription only confers its plan when it's in a LIVE state; an abandoned
// 'incomplete' or 'canceled' row falls back to Free. This is the SINGLE source of
// truth for "is this owner entitled to their plan", shared by entitlements
// (getOwnerPlanId → gating), the transaction commission (checkout + pay routes),
// and the billing dashboard guard. GRACE POLICY (intentional): past_due/unpaid
// retain access + the plan commission rate during Stripe's dunning window so a
// transient payment failure doesn't instantly downgrade a paying customer.
// NOTE: the DB triggers (page-limit, team-collaboration) hardcode this same set
// in SQL — keep them in sync with this constant.
export const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])
const VALID_PLANS = new Set<PlanId>(['free', 'launch', 'pro', 'scale', 'enterprise'])

/**
 * Does this subscription row CONFER its plan right now? active/past_due/unpaid always do
 * (the dunning grace policy). A 'trialing' row confers only while it's inside its window —
 * an expired no-card trial (trial_ends_at in the past) does NOT, so the account drops to
 * Free/paused. 'paused'/'canceled'/'incomplete' never confer. MUST mirror the SQL
 * conferring predicate in 20260627007400 (owner_plan_rank / plan_published_page_limit).
 */
export function subscriptionConfers(status: string | null | undefined, trialEndsAt: string | null | undefined): boolean {
  if (status === 'trialing') {
    return !trialEndsAt || new Date(trialEndsAt).getTime() >= Date.now()
  }
  return status === 'active' || status === 'past_due' || status === 'unpaid'
}

/**
 * Resolve an owner's effective plan id, server-side, from billing_subscriptions.
 * The single source the gating surfaces read so the "what plan is this user on"
 * decision never drifts. Defaults to 'free' (no/invalid/inactive subscription).
 *
 * Pass any Supabase client that can read the owner's billing_subscriptions row
 * (the authed server client for the owner's own pages, or the admin client when
 * resolving another page's owner — e.g. badge/white-label gating on a public page).
 */
export async function getOwnerPlanId(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<PlanId> {
  if (!ownerId) return 'free'
  try {
    // Resolve admin status + subscription in parallel. A platform admin gets the TOP
    // tier everywhere (ENTITLEMENTS only — not an RLS/cross-tenant bypass), mirroring
    // the SQL owner_plan_rank()/plan_published_page_limit() admin short-circuit.
    // supabase-js surfaces query errors in `.error` (no throw), so a missing
    // platform_admins table (e.g. pre-migration) just yields null → billing still
    // resolves normally and gating never breaks.
    const [adminRes, subRes] = await Promise.all([
      supabase.from('platform_admins').select('user_id').eq('user_id', ownerId).maybeSingle<{ user_id: string }>(),
      supabase
        .from('billing_subscriptions')
        .select('plan_id, status, trial_ends_at')
        .eq('owner_id', ownerId)
        .maybeSingle<{ plan_id: string | null; status: string | null; trial_ends_at: string | null }>(),
    ])
    if (adminRes.data) return 'enterprise'
    const sub = subRes.data
    if (sub?.plan_id && VALID_PLANS.has(sub.plan_id as PlanId) && subscriptionConfers(sub.status, sub.trial_ends_at)) {
      return sub.plan_id as PlanId
    }
  } catch {
    // fall through to free on any read error — gating fails safe (most restrictive)
  }
  return 'free'
}

export type OwnerBillingState = {
  /** Entitled tier RIGHT NOW (Free when not conferring) — drives feature gating. */
  planId: PlanId
  /** The plan_id on the row, even when paused — for "your {Pro} trial" display copy. */
  chosenPlanId: PlanId | null
  status: string | null
  /** A conferring sub (active/dunning/in-window trial). */
  isLive: boolean
  /** In-window trial. */
  isTrialing: boolean
  /** Storefront paused: a NEW (trial) account whose trial expired or was paused. Legacy
   *  accounts never pause (they grandfather to Free). */
  isPaused: boolean
  trialEndsAt: string | null
  origin: string | null
}

/**
 * Richer billing state for the dashboard (trial countdown + paused banner). Splits the
 * tier (for gating) from the lifecycle (trialing/paused/trialEndsAt). NEVER auto-pauses on
 * a read error — returns a neutral Free state so a billing blip can't take a paying
 * customer's storefront offline (the real pause gate is the serving flag, set only by a
 * deliberate cron/trigger).
 */
export async function getOwnerBillingState(
  supabase: Pick<SupabaseClient, 'from'>,
  ownerId: string | null | undefined,
): Promise<OwnerBillingState> {
  const neutral: OwnerBillingState = {
    planId: 'free', chosenPlanId: null, status: null,
    isLive: false, isTrialing: false, isPaused: false, trialEndsAt: null, origin: null,
  }
  if (!ownerId) return neutral
  try {
    const [adminRes, subRes] = await Promise.all([
      supabase.from('platform_admins').select('user_id').eq('user_id', ownerId).maybeSingle<{ user_id: string }>(),
      supabase
        .from('billing_subscriptions')
        .select('plan_id, status, trial_ends_at, account_origin')
        .eq('owner_id', ownerId)
        .maybeSingle<{ plan_id: string | null; status: string | null; trial_ends_at: string | null; account_origin: string | null }>(),
    ])
    if (adminRes.data) return { ...neutral, planId: 'enterprise', isLive: true }
    const sub = subRes.data
    if (!sub) return neutral
    const chosen = sub.plan_id && VALID_PLANS.has(sub.plan_id as PlanId) ? (sub.plan_id as PlanId) : null
    const conferring = subscriptionConfers(sub.status, sub.trial_ends_at)
    const trialing = sub.status === 'trialing' && conferring
    const trialExpired = sub.status === 'trialing' && !conferring
    // Only NEW (trial-origin) accounts pause; legacy stays on its grandfathered Free.
    const paused = sub.account_origin === 'trial' && (sub.status === 'paused' || trialExpired)
    return {
      planId: conferring && chosen ? chosen : 'free',
      chosenPlanId: chosen,
      status: sub.status ?? null,
      isLive: conferring,
      isTrialing: trialing,
      isPaused: paused,
      trialEndsAt: sub.trial_ends_at ?? null,
      origin: sub.account_origin ?? null,
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
