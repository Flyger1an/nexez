import {
  PUBLIC_IDENTIFIER_MAX,
  PUBLIC_IDENTIFIER_MIN,
  normalizePublicIdentifier,
  validatePublicIdentifier,
} from './public-identifier'

// Storefront = the account-level brand entity that aggregates a seller's published
// listings at /store/<handle> (STOREFRONT_RENAME.md §5/§7). An account owns 1..N
// storefronts (Phase 4); each listing carries a storefront_id. Public reads go through
// the service-role client in the /store route; this module holds the shared type + the
// pure handle normalizer (used by Storefront settings).

export type Storefront = {
  id: string
  owner_id: string
  handle: string
  display_name: string | null
  description: string | null
  logo_url: string | null
  accent_color: string | null
  /** System-managed quota state. The row remains editable/deletable, but a
   * suspended storefront is excluded from public serving until capacity returns. */
  plan_suspended_at?: string | null
  // §7 billing/payout SEAMS - null ⇒ account-pooled (fall back to the account). Populated
  // only when a storefront becomes its own merchant. Never exposed on public reads.
  stripe_connect_account_id?: string | null
  plan_id?: string | null
  created_at?: string
  updated_at?: string
}

/** A storefront plus its published-listing count, for the account picker + directory. */
export type StorefrontWithCount = Storefront & { listing_count: number }

export const HANDLE_MIN = PUBLIC_IDENTIFIER_MIN
export const HANDLE_MAX = PUBLIC_IDENTIFIER_MAX

/**
 * Normalize a user-entered storefront handle to the DB-safe form (matches the
 * `storefronts_handle_format` CHECK: ^[a-z0-9-]+$, 1–63 chars) with no leading, trailing,
 * or doubled hyphens. Returns '' when nothing usable remains (caller rejects empty).
 */
export function normalizeHandle(input: unknown): string {
  return normalizePublicIdentifier(input)
    .slice(0, HANDLE_MAX)
    .replace(/-+$/, '')
}

/** True when a handle is already in the canonical, DB-valid form. */
export function isValidHandle(handle: string): boolean {
  return validatePublicIdentifier(handle).ok
}

// ── §7 billing/payout SEAMS ────────────────────────────────────────────────────────────
// v1 is ACCOUNT-POOLED: a storefront's own Connect account / plan are null, so these
// resolve to the account's. The day a storefront becomes its own merchant, populate the
// storefront columns and the SAME call sites switch over with no further plumbing.

type StorefrontSeam = { stripe_connect_account_id?: string | null; plan_id?: string | null } | null | undefined

/** The Connect account that should receive a storefront's payouts: storefront ?? account. */
export function resolveStorefrontConnectAccount(storefront: StorefrontSeam, accountConnectAccountId: string | null): string | null {
  return storefront?.stripe_connect_account_id ?? accountConnectAccountId
}

/** The plan whose commission/limits apply to a storefront: storefront ?? account. */
export function resolveStorefrontPlanId(storefront: StorefrontSeam, accountPlanId: string | null): string | null {
  return storefront?.plan_id ?? accountPlanId
}
