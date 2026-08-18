import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { acpCheckoutEnabled } from '../acp/constants'
import { ucpCheckoutEnabled } from '../ucp/constants'

// Server-side resolution of who may TRANSACT through an agent (ChatGPT/Google), used by
// two callers that must never disagree:
//   - the ACP/UCP feeds → gate is_eligible_checkout per seller (Connect), and
//   - the merchant status card in Settings → show the true, per-listing status.
//
// Agentic checkout is foundational on every plan. Operational eligibility depends on a
// charge-ready Stripe Connect account plus the program env flag supplied by callers.
// Everything FAILS CLOSED when settlement readiness cannot be verified.

type Admin = Pick<SupabaseClient, 'from'>

type BillingRow = {
  owner_id?: string | null
  stripe_connect_account_id: string | null
  stripe_connect_charges_enabled: boolean | null
}

/** Compatibility input for the existing card/API shape plus the authoritative
 * settlement-readiness check. The plan value is always true for a resolved owner. */
function ownerCheckoutInputs(row: BillingRow | undefined): { planAllowsCheckout: boolean; connectReady: boolean } {
  const connectReady = Boolean(row?.stripe_connect_account_id && row?.stripe_connect_charges_enabled === true)
  return { planAllowsCheckout: true, connectReady }
}

/** Per-owner checkout inputs for ONE owner (the status card). Fails closed to both-false. */
export async function resolveOwnerCheckoutInputs(
  admin: Admin,
  ownerId: string | null | undefined,
): Promise<{ planAllowsCheckout: boolean; connectReady: boolean }> {
  if (!ownerId) return { planAllowsCheckout: false, connectReady: false }
  try {
    const { data } = await admin
      .from('billing_subscriptions')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('owner_id', ownerId)
      .maybeSingle<BillingRow>()
    return ownerCheckoutInputs(data ?? undefined)
  } catch {
    return { planAllowsCheckout: true, connectReady: false }
  }
}

/** Owner-level agentic-checkout eligibility (Connect), batched over many owners in
 *  exactly one query regardless of count. Fails CLOSED: any read error, or a missing
 *  service role, yields an empty set. */
export async function resolveCheckoutEligibleOwners(admin: Admin, ownerIds: string[]): Promise<Set<string>> {
  const eligible = new Set<string>()
  const ids = [...new Set(ownerIds.filter(Boolean))] as string[]
  if (!ids.length) return eligible
  try {
    const { data } = await admin
      .from('billing_subscriptions')
      .select('owner_id, stripe_connect_account_id, stripe_connect_charges_enabled')
      .in('owner_id', ids)
      .returns<BillingRow[]>()
    const byOwner = new Map<string, BillingRow>()
    for (const row of data ?? []) if (row.owner_id) byOwner.set(row.owner_id, row)
    for (const owner of ids) {
      if (ownerCheckoutInputs(byOwner.get(owner)).connectReady) eligible.add(owner)
    }
  } catch {
    return new Set() // fail closed
  }
  return eligible
}

/** Map published slugs to the subset whose owner is settlement-ready.
 * Two batch queries total (pages + billing). Fails closed to an empty set. */
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
