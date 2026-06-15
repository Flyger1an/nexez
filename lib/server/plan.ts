import type { SupabaseClient } from '@supabase/supabase-js'
import { type PlanId } from '../billing'

// A subscription only confers its plan when it's in a live state; an abandoned
// 'incomplete' or 'canceled' row falls back to Free (mirrors the billing page guard).
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])
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
    const { data } = await supabase
      .from('billing_subscriptions')
      .select('plan_id, status')
      .eq('owner_id', ownerId)
      .maybeSingle<{ plan_id: string | null; status: string | null }>()
    const planId = data?.plan_id
    if (planId && VALID_PLANS.has(planId as PlanId) && LIVE_STATUSES.has(data?.status ?? '')) {
      return planId as PlanId
    }
  } catch {
    // fall through to free on any read error — gating fails safe (most restrictive)
  }
  return 'free'
}
