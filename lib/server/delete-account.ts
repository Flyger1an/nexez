import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import {
  BUYER_DATA_CONTRACT,
  BUYER_USER_ID_TABLES,
  buyerAnonymizationPatch,
  buyerMatches,
  type BuyerDataContract,
  type BuyerMatch,
} from './privacy-contract'
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

/**
 * SELLER-facet rows keyed by user_id - deleted ONLY in the pure-buyer full-removal path.
 *
 * SMS delivery history references the destination with ON DELETE RESTRICT, so it
 * must be cleared before the account-level SMS destination below.
 */
const SELLER_USER_ID_TABLES = ['sms_notification_events'] as const

/**
 * Account-level rows keyed by user_id - deleted ONLY in the pure-buyer full-removal path.
 * They are retained when a Nexxi buyer also owns a Nexez seller account, alongside
 * that seller's notification preferences and verified destination.
 */
const ACCOUNT_USER_ID_TABLES = [
  'user_integrations',
  'platform_admins',
  'sms_subscriptions',
  'user_sms_destinations',
] as const

/** SELLER tables keyed by owner_id - deleted ONLY in the pure-buyer full-removal path. */
const SELLER_OWNER_ID_TABLES = [
  'agent_visits',
  'api_keys',
  'billing_subscriptions',
  'checkout_events',
  // Interview transcripts are personal data with NO auth.users FK (pages FK is
  // SET NULL) - without this entry they'd survive account deletion orphaned.
  'intake_sessions',
  'outbound_webhooks',
  'page_secrets',
  // Agreements can outlive their page (page_id is ON DELETE SET NULL), so they
  // must be discovered and deleted directly by owner_id. Staged obligations
  // follow their agreement through ON DELETE CASCADE.
  'service_agreements',
  'staged_settlement_agreements',
  'pages',
  'promotional_plan_grants',
  'published_page_grandfather',
  'seller_growth_events',
  'sent_system_emails',
  'storefronts',
  'support_tickets',
  'team_invites',
] as const

/** Owning a row in any of these = the account is also a SELLER → retain the seller facet + login. */
const SELLER_SIGNAL_TABLES = [
  'pages',
  'billing_subscriptions',
  'api_keys',
  'service_agreements',
  'staged_settlement_agreements',
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

  for (const contract of BUYER_DATA_CONTRACT) {
    const matches = buyerMatches(contract, userId, email)
    if (contract.jsonColumn) {
      const rows = await readRowsForAnonymization(admin, contract, matches, errors)
      for (const row of rows) {
        const { error } = await admin
          .from(contract.table)
          .update(buyerAnonymizationPatch(contract, row))
          .eq('id', row.id)
        if (error) errors.push({ scope: `anonymize:${contract.table}:id`, message: error.message })
      }
      continue
    }

    const patch = buyerAnonymizationPatch(contract)
    for (const match of matches) {
      const query = admin.from(contract.table).update(patch)
      const { error } = match.kind === 'reference'
        ? await query.eq(match.column, match.value)
        : await query.ilike(match.column, escapeLike(match.value))
      if (error) errors.push({ scope: `anonymize:${contract.table}:${match.column}`, message: error.message })
    }
  }
}

async function readRowsForAnonymization(
  admin: SupabaseClient,
  contract: BuyerDataContract,
  matches: BuyerMatch[],
  errors: DeleteAccountResult['errors'],
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const rows = new Map<string, Record<string, unknown> & { id: string }>()
  const pageSize = 500
  for (const match of matches) {
    for (let page = 0; ; page += 1) {
      const from = page * pageSize
      const selected = admin.from(contract.table).select(`id, ${contract.jsonColumn}`)
      const filtered = match.kind === 'reference'
        ? selected.eq(match.column, match.value)
        : selected.ilike(match.column, escapeLike(match.value))
      const { data, error } = await filtered
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) {
        errors.push({ scope: `anonymize:${contract.table}:lookup:${match.column}`, message: error.message })
        break
      }
      const batch = (data ?? []) as unknown as Array<Record<string, unknown> & { id?: unknown }>
      for (const row of batch) {
        if (typeof row.id === 'string') rows.set(row.id, row as Record<string, unknown> & { id: string })
      }
      if (batch.length < pageSize) break
    }
  }
  return [...rows.values()]
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
  // Do not remove the login after an incomplete erasure. Keeping the auth user
  // makes the request safely retryable instead of orphaning buyer PII that can
  // no longer be matched to an account.
  if (errors.length) {
    return { ok: false, authUserDeleted: false, sellerRetained: false, errors }
  }

  // 2. Does this account also sell on Nexez? If so, STOP - keep the seller data and the login.
  if (await accountIsSeller(admin, userId)) {
    return { ok: true, authUserDeleted: false, sellerRetained: true, errors }
  }

  // 3. Pure buyer → full removal: seller event history first, then account
  //    settings (including SMS destination/subscription), then the auth user LAST.
  //    We delete explicitly even though these rows cascade from auth.users so
  //    errors are collected and the destination's RESTRICT FK cannot strand data.
  for (const table of SELLER_USER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }
  for (const table of ACCOUNT_USER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }
  for (const table of SELLER_OWNER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('owner_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }
  // Growth invitations use role-specific ownership columns rather than owner_id.
  const { error: sentGrowthInviteError } = await admin
    .from('seller_growth_invites')
    .delete()
    .eq('inviter_owner_id', userId)
  if (sentGrowthInviteError) {
    errors.push({ scope: 'delete:seller_growth_invites:sent', message: sentGrowthInviteError.message })
  }
  const { error: acceptedGrowthInviteError } = await admin
    .from('seller_growth_invites')
    .delete()
    .eq('accepted_by_owner_id', userId)
  if (acceptedGrowthInviteError) {
    errors.push({ scope: 'delete:seller_growth_invites:accepted', message: acceptedGrowthInviteError.message })
  }
  if (email) {
    // Invites the user RECEIVED (keyed by their email, not owner_id).
    const { error } = await admin.from('team_invites').delete().ilike('email', escapeLike(email))
    if (error) errors.push({ scope: 'delete:team_invites:received', message: error.message })
    const { error: growthInviteError } = await admin
      .from('seller_growth_invites')
      .delete()
      .ilike('invitee_email', escapeLike(email))
    if (growthInviteError) {
      errors.push({ scope: 'delete:seller_growth_invites:received', message: growthInviteError.message })
    }
  }

  if (errors.length) {
    return { ok: false, authUserDeleted: false, sellerRetained: false, errors }
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
  ACCOUNT_USER_ID_TABLES,
  SELLER_OWNER_ID_TABLES,
  SELLER_SIGNAL_TABLES,
  BUYER_DATA_CONTRACT,
}
