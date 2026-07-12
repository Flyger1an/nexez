import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { planAllows, type PlanId } from '../billing'
import { subscriptionConfers } from './plan'
import { acpCheckoutEnabled } from '../acp/constants'
import { ucpCheckoutEnabled } from '../ucp/constants'

// Server-side resolution of who may TRANSACT through an agent (ChatGPT/Google), used by
// two callers that must never disagree:
//   - the ACP/UCP feeds → gate is_eligible_checkout per seller (plan + Connect), and
//   - the merchant status card in Settings → show the true, per-listing status.
//
// The gate has three legs: the owner's plan includes agenticCheckout (Pro+), their Stripe
// Connect account can accept a charge, and the program env flag is on. This module owns
// the first two (per-owner); callers supply the program flag. Everything FAILS CLOSED — a
// billing blip or a missing service role must never hand a free seller a paid capability.

type Admin = Pick<SupabaseClient, 'from'>

const VALID_PLANS = new Set<PlanId>(['free', 'launch', 'pro', 'scale', 'enterprise'])

type BillingRow = {
  owner_id?: string | null
  plan_id: string | null
  status: string | null
  trial_ends_at: string | null
  stripe_connect_account_id: string | null
  stripe_connect_charges_enabled: boolean | null
}

/** The two granular gates the card needs (so it can say WHY checkout isn't live), derived
 *  from an owner's billing row. Mirrors getOwnerPlanId's conferring logic + the settlement
 *  bridge's charges_enabled check — the shared truth for both. */
function ownerCheckoutInputs(row: BillingRow | undefined, isAdmin: boolean): { planAllowsCheckout: boolean; connectReady: boolean } {
  const connectReady = Boolean(row?.stripe_connect_account_id && row?.stripe_connect_charges_enabled === true)
  const planId: PlanId = isAdmin
    ? 'enterprise' // platform-admin entitlements god-mode (money still needs Connect below)
    : row?.plan_id && VALID_PLANS.has(row.plan_id as PlanId) && subscriptionConfers(row.status, row.trial_ends_at)
      ? (row.plan_id as PlanId)
      : 'free'
  return { planAllowsCheckout: planAllows(planId, 'agenticCheckout'), connectReady }
}

/** Per-owner checkout inputs for ONE owner (the status card). Fails closed to both-false. */
export async function resolveOwnerCheckoutInputs(
  admin: Admin,
  ownerId: string | null | undefined,
): Promise<{ planAllowsCheckout: boolean; connectReady: boolean }> {
  if (!ownerId) return { planAllowsCheckout: false, connectReady: false }
  try {
    const [adminRes, subRes] = await Promise.all([
      admin.from('platform_admins').select('user_id').eq('user_id', ownerId).maybeSingle<{ user_id: string }>(),
      admin
        .from('billing_subscriptions')
        .select('plan_id, status, trial_ends_at, stripe_connect_account_id, stripe_connect_charges_enabled')
        .eq('owner_id', ownerId)
        .maybeSingle<BillingRow>(),
    ])
    return ownerCheckoutInputs(subRes.data ?? undefined, Boolean(adminRes.data))
  } catch {
    return { planAllowsCheckout: false, connectReady: false }
  }
}

/** Owner-level agentic-checkout eligibility (plan + Connect), batched over many owners in
 *  exactly two queries regardless of count. Fails CLOSED: any read error, or a missing
 *  service role, yields an empty set. */
export async function resolveCheckoutEligibleOwners(admin: Admin, ownerIds: string[]): Promise<Set<string>> {
  const eligible = new Set<string>()
  const ids = [...new Set(ownerIds.filter(Boolean))] as string[]
  if (!ids.length) return eligible
  try {
    const [adminRes, subRes] = await Promise.all([
      admin.from('platform_admins').select('user_id').in('user_id', ids).returns<{ user_id: string }[]>(),
      admin
        .from('billing_subscriptions')
        .select('owner_id, plan_id, status, trial_ends_at, stripe_connect_account_id, stripe_connect_charges_enabled')
        .in('owner_id', ids)
        .returns<BillingRow[]>(),
    ])
    const admins = new Set((adminRes.data ?? []).map((r) => r.user_id))
    const byOwner = new Map<string, BillingRow>()
    for (const row of subRes.data ?? []) if (row.owner_id) byOwner.set(row.owner_id, row)
    for (const owner of ids) {
      const { planAllowsCheckout, connectReady } = ownerCheckoutInputs(byOwner.get(owner), admins.has(owner))
      if (planAllowsCheckout && connectReady) eligible.add(owner)
    }
  } catch {
    return new Set() // fail closed
  }
  return eligible
}

/** Map a set of published slugs → the subset whose OWNER may transact (plan + Connect).
 *  Two batch queries total. Fails closed to an empty set. */
export async function resolveCheckoutEligibleSlugs(admin: Admin, slugs: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const uniq = [...new Set(slugs.filter(Boolean))] as string[]
  if (!uniq.length) return out
  try {
    const { data: rows } = await admin
      .from('pages')
      .select('slug, owner_id')
      .in('slug', uniq)
      .eq('is_published', true)
      .returns<{ slug: string; owner_id: string | null }[]>()
    if (!rows?.length) return out
    const slugOwner = new Map<string, string>()
    for (const r of rows) if (r.slug && r.owner_id) slugOwner.set(r.slug, r.owner_id)
    const eligibleOwners = await resolveCheckoutEligibleOwners(admin, [...slugOwner.values()])
    for (const [slug, owner] of slugOwner) if (eligibleOwners.has(owner)) out.add(slug)
  } catch {
    return new Set()
  }
  return out
}

/** For the ACP feed route: the set of visible slugs that may transact, or `null` when the
 *  ACP program itself is switched off (the caller then leaves every item search-only). A
 *  program that's ON but has no service role returns an empty set (fail closed). */
export async function acpCheckoutEligibleSlugs(slugs: string[]): Promise<Set<string> | null> {
  if (!acpCheckoutEnabled()) return null
  if (!hasSupabaseAdminEnv()) return new Set()
  return resolveCheckoutEligibleSlugs(createAdminClient(), slugs)
}

/** UCP counterpart of {@link acpCheckoutEligibleSlugs}. */
export async function ucpCheckoutEligibleSlugs(slugs: string[]): Promise<Set<string> | null> {
  if (!ucpCheckoutEnabled()) return null
  if (!hasSupabaseAdminEnv()) return new Set()
  return resolveCheckoutEligibleSlugs(createAdminClient(), slugs)
}

/** Per-surface program flags the merchant card reads. ChatGPT (ACP) and Google (UCP)
 *  enroll independently and go live at different times, so they are reported separately —
 *  the card must never claim a surface is live when only the OTHER one is on. */
export function agenticProgramFlags(): { chatgptLive: boolean; googleLive: boolean } {
  return { chatgptLive: acpCheckoutEnabled(), googleLive: ucpCheckoutEnabled() }
}
