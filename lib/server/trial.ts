import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getBillingPlan } from '../billing'

export const TRIAL_DAYS = 7

/**
 * Idempotently seed a 7-day no-card trial for a NEW user who has no billing row yet and
 * signed up under a trialable plan (the plan id rides in their auth user_metadata). Inserts
 * only when no row exists, so it's safe to call from the dashboard as a safety net for the
 * email-confirmation signup path (where /api/billing/start-trial couldn't run client-side
 * without a session). Returns true iff it seeded. Best-effort: never throws.
 */
export async function ensureTrialSeeded(ownerId: string | null | undefined, planMeta: unknown): Promise<boolean> {
  if (!ownerId || !hasSupabaseAdminEnv()) return false
  // Backstop: a new account that reached here with no chosen plan (or an invalid one)
  // defaults to a Pro trial, so NO signup path can leave an account on the retired Free
  // tier. An explicit 'free'/'enterprise' choice opts out (Enterprise = contact sales).
  const chosen = typeof planMeta === 'string' ? planMeta : ''
  const plan = getBillingPlan(chosen) ?? (chosen === '' ? getBillingPlan('pro') : undefined)
  if (!plan || plan.id === 'free' || plan.id === 'enterprise') return false
  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('billing_subscriptions')
      .select('owner_id')
      .eq('owner_id', ownerId)
      .maybeSingle<{ owner_id: string }>()
    if (existing) return false // legacy/trial/paid all preserved — never overwrite
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
