import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { getBillingPlan } from '../../../../lib/billing'

const TRIAL_DAYS = 7

/**
 * Start a new account's 7-day, no-card trial of the plan it picked at signup (Shopify-style).
 * Idempotent + one-per-account: it ONLY seeds a trial when the account has no billing row at
 * all. A row already present means the account is grandfathered ('legacy'), already trialing,
 * or already subscribed — none of which we overwrite (a legacy user upgrades via checkout, not
 * by starting a fresh trial that would later pause away their grandfathered access).
 *
 * Service-role write: RLS blocks client inserts on billing_subscriptions, and the resolvers
 * key entitlements off this row, so it must be written server-side.
 */
export async function POST(request: Request) {
  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Trials are not available on this deployment.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: string; planId?: string }
  const plan = getBillingPlan(String(body.plan || body.planId || ''))
  if (!plan || plan.id === 'free' || plan.id === 'enterprise') {
    return NextResponse.json(
      { error: 'Pick a trialable plan (Launch, Pro, or Scale).' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('account_origin, status, plan_id, trial_ends_at')
    .eq('owner_id', user.id)
    .maybeSingle<{ account_origin: string | null; status: string | null; plan_id: string | null; trial_ends_at: string | null }>()

  // Already has billing state → don't touch it (idempotent; legacy/trial/paid all preserved).
  if (existing) {
    return NextResponse.json({ ok: true, alreadyHadAccount: true, planId: existing.plan_id, status: existing.status })
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .insert({
      owner_id: user.id,
      plan_id: plan.id,
      status: 'trialing',
      trial_ends_at: trialEndsAt,
      account_origin: 'trial',
      metadata: { source: 'start-trial' },
    })
    .select('plan_id, status, trial_ends_at')
    .maybeSingle()
  if (error) {
    // owner_id PK race (a parallel start-trial won) → treat as already-started, not an error.
    if (error.code === '23505') return NextResponse.json({ ok: true, alreadyHadAccount: true })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, planId: data?.plan_id, status: data?.status, trialEndsAt: data?.trial_ends_at })
}
