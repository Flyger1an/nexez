import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { escapeLike } from './sql-escape'

// Account deletion for the Nexxi BUYER app (App Store 5.1.1(v) + GDPR/CCPA erasure).
//
// Nexxi and the Nexez seller dashboard SHARE one auth account (SSO), but they are separate FACETS:
//   - buyer facet  = the personal buyer-agent data + buyer PII on sellers' records
//   - seller facet = pages, billing, api keys, etc. owned by the same auth user
//
// "Delete my Nexxi account" must NEVER destroy the seller's business. So we always clear the BUYER
// facet, then branch:
//   - account ALSO owns seller data → KEEP the seller data AND the auth user (login still works for
//     Nexez); return sellerRetained=true. Critically we do NOT delete the auth user, because several
//     seller tables `on delete cascade` to auth.users - deleting it would wipe the seller's pages.
//   - pure buyer (no seller data) → full removal incl. the auth user ("can't sign back in").
//
// Buyer-side rows on OTHER sellers' records have no FK to the buyer, so the anonymizer below is the
// ONLY path that erases that buyer PII - it must stay exhaustive and runs in BOTH branches.

/** BUYER-facet tables (keyed by user_id) - always deleted. */
const BUYER_USER_ID_TABLES = [
  'agent_action_approvals',
  'agent_messages',
  'agent_tasks',
  'agent_threads',
  'notifications',
  'referral_codes',
  'saved_pages',
  'saved_searches',
  'user_agents',
  'user_push_tokens',
] as const

/** SELLER/account tables keyed by user_id - deleted ONLY in the pure-buyer full-removal path. */
const SELLER_USER_ID_TABLES = ['user_integrations', 'platform_admins'] as const

/** SELLER tables keyed by owner_id - deleted ONLY in the pure-buyer full-removal path. */
const SELLER_OWNER_ID_TABLES = [
  'agent_visits',
  'api_keys',
  'billing_subscriptions',
  'checkout_events',
  'outbound_webhooks',
  'page_secrets',
  'pages',
  'published_page_grandfather',
  'sent_system_emails',
  'support_tickets',
  'team_invites',
] as const

/** Owning a row in any of these = the account is also a SELLER → retain the seller facet + login. */
const SELLER_SIGNAL_TABLES = ['pages', 'billing_subscriptions', 'api_keys'] as const

/**
 * Tables where the deleted user appears as the BUYER on another seller's record. The sale/record is
 * the seller's to keep, so we ERASE the buyer's PII columns rather than delete the row. (Buyer facet.)
 *
 * Matching is best-effort (there is no buyer→auth.users FK): `emailColumns` are columns whose value
 * can equal the user's email (buyer_email always; `contact` is free-form and may hold the email when
 * buyer_email was never captured); `referenceColumn` is the stronger link where the row stores the
 * buyer's auth user id. `columns` is everything we null - incl. free text the buyer typed.
 */
const BUYER_PII_TABLES = [
  {
    table: 'agent_negotiations',
    columns: ['buyer_email', 'contact', 'buyer_query', 'budget_text', 'timeline_text', 'buyer_agent'],
    emailColumns: ['buyer_email', 'contact'],
    referenceColumn: null,
  },
  {
    table: 'checkout_orders',
    columns: ['buyer_email', 'buyer_name', 'buyer_reference', 'buyer_agent'],
    emailColumns: ['buyer_email'],
    referenceColumn: 'buyer_reference',
  },
  {
    table: 'order_requests',
    columns: ['buyer_email', 'message'],
    emailColumns: ['buyer_email'],
    referenceColumn: null,
  },
] as const

export type DeleteAccountResult = {
  ok: boolean
  authUserDeleted: boolean
  /** True when the account also sells on Nexez: the buyer facet was cleared but the seller account + login were KEPT. */
  sellerRetained: boolean
  errors: { scope: string; message: string }[]
}

/** Does this auth user own any seller data? (pages / billing / api keys) */
async function accountIsSeller(admin: SupabaseClient, userId: string): Promise<boolean> {
  for (const table of SELLER_SIGNAL_TABLES) {
    const { data, error } = await admin.from(table).select('owner_id').eq('owner_id', userId).limit(1)
    if (error) {
      // Fail SAFE: if we can't tell, assume seller so we never accidentally cascade-delete a business.
      return true
    }
    if (data && data.length > 0) return true
  }
  return false
}

/**
 * Erase the buyer's own chat turns from sellers' negotiation threads. The negotiation ROW is the
 * seller's record (kept), and negotiation_messages `on delete cascade`s from it - so that cascade
 * never fires on buyer deletion. We null the buyer message `content` (keeps the thread's shape, drops
 * the PII the buyer typed). MUST run BEFORE agent_negotiations buyer_email/contact are nulled, since
 * email is the only link back to the buyer's negotiations.
 */
async function eraseBuyerNegotiationMessages(
  admin: SupabaseClient,
  email: string | null,
  errors: DeleteAccountResult['errors'],
): Promise<void> {
  if (!email) return
  const pattern = escapeLike(email)
  const ids = new Set<string>()
  for (const col of ['buyer_email', 'contact'] as const) {
    const { data, error } = await admin.from('agent_negotiations').select('id').ilike(col, pattern)
    if (error) {
      errors.push({ scope: `erase-messages:lookup:${col}`, message: error.message })
      continue
    }
    for (const row of (data ?? []) as { id: string }[]) ids.add(row.id)
  }
  if (!ids.size) return
  const { error } = await admin
    .from('negotiation_messages')
    .update({ content: {} })
    .in('negotiation_id', [...ids])
    .eq('role', 'buyer')
  if (error) errors.push({ scope: 'erase-messages:negotiation_messages', message: error.message })
}

/** Erase the deleted user's buyer PII from sellers' transaction records (runs in both branches). */
async function anonymizeBuyerPii(
  admin: SupabaseClient,
  userId: string,
  email: string | null,
  errors: DeleteAccountResult['errors'],
): Promise<void> {
  // Buyer chat content first - it's resolved via agent_negotiations' email columns, which the loop below nulls.
  await eraseBuyerNegotiationMessages(admin, email, errors)

  for (const { table, columns, emailColumns, referenceColumn } of BUYER_PII_TABLES) {
    const patch = Object.fromEntries(columns.map((c) => [c, null]))
    if (referenceColumn) {
      const { error } = await admin.from(table).update(patch).eq(referenceColumn, userId)
      if (error) errors.push({ scope: `anonymize:${table}:${referenceColumn}`, message: error.message })
    }
    if (email) {
      const pattern = escapeLike(email)
      for (const col of emailColumns) {
        const { error } = await admin.from(table).update(patch).ilike(col, pattern)
        if (error) errors.push({ scope: `anonymize:${table}:${col}`, message: error.message })
      }
    }
  }
}

/**
 * Delete the BUYER facet of an account; keep the seller facet (+ login) if the account also sells.
 * Best-effort per table (collect errors, keep going). Requires the service role; callers must
 * authenticate + authorize the user first.
 */
export async function deleteUserAccount(userId: string, email: string | null): Promise<DeleteAccountResult> {
  const errors: DeleteAccountResult['errors'] = []
  if (!hasSupabaseAdminEnv()) {
    return { ok: false, authUserDeleted: false, sellerRetained: false, errors: [{ scope: 'config', message: 'Service role not configured.' }] }
  }
  const admin = createAdminClient()

  // 1. Always clear the BUYER facet + anonymize buyer PII on sellers' records.
  for (const table of BUYER_USER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }
  // Referral attribution is keyed by referrer_user_id / referred_user_id (no plain user_id) - clear both.
  for (const column of ['referrer_user_id', 'referred_user_id'] as const) {
    const { error } = await admin.from('referrals').delete().eq(column, userId)
    if (error) errors.push({ scope: `delete:referrals:${column}`, message: error.message })
  }
  await anonymizeBuyerPii(admin, userId, email, errors)

  // 2. Does this account also sell on Nexez? If so, STOP - keep the seller data and the login.
  if (await accountIsSeller(admin, userId)) {
    return { ok: true, authUserDeleted: false, sellerRetained: true, errors }
  }

  // 3. Pure buyer → full removal: remaining account tables (empty for a pure buyer, but be thorough),
  //    then the auth user LAST.
  for (const table of SELLER_USER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }
  for (const table of SELLER_OWNER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('owner_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }
  if (email) {
    // Invites the user RECEIVED (keyed by their email, not owner_id).
    const { error } = await admin.from('team_invites').delete().ilike('email', escapeLike(email))
    if (error) errors.push({ scope: 'delete:team_invites:received', message: error.message })
  }

  const authUserDeleted = await deleteAuthUser(admin, userId)
  if (!authUserDeleted) errors.push({ scope: 'auth.deleteUser', message: 'Failed to delete the auth user.' })

  return { ok: authUserDeleted, authUserDeleted, sellerRetained: false, errors }
}

async function deleteAuthUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { error } = await admin.auth.admin.deleteUser(userId)
    return !error
  } catch {
    return false
  }
}

// Exposed for tests.
export const __DELETE_ACCOUNT_TABLES = {
  BUYER_USER_ID_TABLES,
  SELLER_USER_ID_TABLES,
  SELLER_OWNER_ID_TABLES,
  SELLER_SIGNAL_TABLES,
  BUYER_PII_TABLES,
}
