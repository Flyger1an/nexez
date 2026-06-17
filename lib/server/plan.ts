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
        .select('plan_id, status')
        .eq('owner_id', ownerId)
        .maybeSingle<{ plan_id: string | null; status: string | null }>(),
    ])
    if (adminRes.data) return 'enterprise'
    const planId = subRes.data?.plan_id
    if (planId && VALID_PLANS.has(planId as PlanId) && LIVE_STATUSES.has(subRes.data?.status ?? '')) {
      return planId as PlanId
    }
  } catch {
    // fall through to free on any read error — gating fails safe (most restrictive)
  }
  return 'free'
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
