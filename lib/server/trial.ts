import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getBillingPlan, isSelfServePlanId } from '../billing'

export const TRIAL_DAYS = 7

/** Only self-serve paid plans can start the no-card trial. */
export function isTrialablePlan(value: unknown): value is 'launch' | 'pro' | 'scale' {
  return isSelfServePlanId(value)
}

/**
 * True only when the owner has a CONFIRMED billing_subscriptions row (legacy, trialing,
 * or paid). Returns false for both "no row" and "couldn't read" - callers use this to
 * decide whether to route a plan-less new user through onboarding, and sending a
 * billing-having user there is harmless (start-trial is idempotent and /onboard
 * re-checks), while the opposite mistake would silently seed a default-plan trial.
 */
export async function hasBillingAccount(ownerId: string | null | undefined): Promise<boolean> {
  if (!ownerId || !hasSupabaseAdminEnv()) return false
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('billing_subscriptions')
      .select('owner_id')
      .eq('owner_id', ownerId)
      .maybeSingle<{ owner_id: string }>()
    return Boolean(data)
  } catch {
    return false
  }
}

/**
 * Idempotently seed a 7-day no-card trial for a NEW user who has no billing row yet and
 * signed up under a trialable plan (the plan id rides in their auth user_metadata). Inserts
 * only when no row exists, so it's safe to call from the dashboard as a safety net for the
 * email-confirmation signup path (where /api/billing/start-trial couldn't run client-side
 * without a session). Returns true iff it seeded. Best-effort: never throws.
 */
export async function ensureTrialSeeded(ownerId: string | null | undefined, planMeta: unknown): Promise<boolean> {
  if (!ownerId || !hasSupabaseAdminEnv()) return false
  // Never invent a plan here. Plan-less OAuth users must make an explicit choice in
  // onboarding; this helper only persists a valid choice already made by the user.
  if (!isTrialablePlan(planMeta)) return false
  const plan = getBillingPlan(planMeta)!
  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('billing_subscriptions')
      .select('owner_id')
      .eq('owner_id', ownerId)
      .maybeSingle<{ owner_id: string }>()
    if (existing) return false // legacy/trial/paid all preserved - never overwrite
    const { error } = await admin.from('billing_subscriptions').insert({
      owner_id: ownerId,
      plan_id: plan.id,
      status: 'trialing',
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
      account_origin: 'trial',
      metadata: { source: 'dashboard-ensure' },
    })
    return !error
  } catch {
    return false
  }
}
