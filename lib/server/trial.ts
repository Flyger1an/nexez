import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getBillingPlan, isSelfServePlanId } from '../billing'
import type { PlanId } from '../billing'

export const TRIAL_DAYS = 7

/** Only self-serve paid plans can start the no-card trial. */
export function isTrialablePlan(value: unknown): value is 'launch' | 'pro' | 'scale' {
  return isSelfServePlanId(value)
}

/** Plans available during self-serve onboarding. Free creates a durable account
 * state; paid plans retain the existing seven-day no-card trial. */
export function isSelectablePlan(value: unknown): value is Exclude<PlanId, 'enterprise'> {
  return value === 'free' || isTrialablePlan(value)
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
 * Idempotently seed the billing state explicitly selected during onboarding. Free
 * becomes an active, non-Stripe account row. Launch/Pro/Scale retain the existing
 * seven-day no-card trial. This never manufactures a promotional Launch subscription:
 * time-bounded campaign access lives in promotional_plan_grants.
 */
export async function ensureBillingSeeded(ownerId: string | null | undefined, planMeta: unknown): Promise<boolean> {
  if (!ownerId || !hasSupabaseAdminEnv()) return false
  if (!isSelectablePlan(planMeta)) return false
  const plan = getBillingPlan(planMeta)!
  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('billing_subscriptions')
      .select('owner_id')
      .eq('owner_id', ownerId)
      .maybeSingle<{ owner_id: string }>()
    if (existing) return false // legacy/trial/paid all preserved - never overwrite
    const isFree = plan.id === 'free'
    const { error } = await admin.from('billing_subscriptions').insert({
      owner_id: ownerId,
      plan_id: plan.id,
      status: isFree ? 'active' : 'trialing',
      trial_ends_at: isFree ? null : new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
      account_origin: isFree ? 'free' : 'trial',
      metadata: { source: 'dashboard-ensure', billing_kind: isFree ? 'free' : 'trial' },
    })
    return !error
  } catch {
    return false
  }
}

/** Backward-compatible name for older call sites. */
export const ensureTrialSeeded = ensureBillingSeeded
