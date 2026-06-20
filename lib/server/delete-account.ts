import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

// Full account deletion (App Store Guideline 5.1.1(v) + GDPR/CCPA erasure). There are NO FK
// cascades to auth.users in this schema, so every owned table is cleared explicitly, then the
// Supabase auth user is deleted last (so "can't sign back in" holds even if a data delete failed).
// The Nexez account is shared between the seller dashboard and the Nexxi buyer app, so deletion
// removes BOTH the buyer/agent data AND any seller pages the account owns.

/** Tables keyed by the auth user id — the user's agent + personal data. */
const USER_ID_TABLES = [
  'agent_action_approvals',
  'agent_messages',
  'agent_threads',
  'user_agents',
  'user_integrations',
  'user_push_tokens',
  'platform_admins',
] as const

/** Tables keyed by owner_id — the seller-side data this account owns. */
const OWNER_ID_TABLES = [
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

/**
 * Tables where the deleted user appears as the BUYER on another seller's record. The sale/record
 * is the seller's to keep, so we ERASE the buyer PII (email + reference) rather than delete the row.
 */
const BUYER_PII_TABLES = [
  { table: 'agent_negotiations', columns: ['buyer_email'] },
  { table: 'checkout_orders', columns: ['buyer_email', 'buyer_reference'] },
  { table: 'order_requests', columns: ['buyer_email'] },
] as const

export type DeleteAccountResult = {
  ok: boolean
  authUserDeleted: boolean
  errors: { scope: string; message: string }[]
}

/**
 * Delete a user's account and all associated data. Best-effort per table (collect errors, keep
 * going) so a single failure can't strand the rest, then delete the auth user. Requires the
 * service role; callers must authenticate + authorize the user first.
 */
export async function deleteUserAccount(userId: string, email: string | null): Promise<DeleteAccountResult> {
  const errors: DeleteAccountResult['errors'] = []
  if (!hasSupabaseAdminEnv()) {
    return { ok: false, authUserDeleted: false, errors: [{ scope: 'config', message: 'Service role not configured.' }] }
  }
  const admin = createAdminClient()

  for (const table of USER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }

  for (const table of OWNER_ID_TABLES) {
    const { error } = await admin.from(table).delete().eq('owner_id', userId)
    if (error) errors.push({ scope: `delete:${table}`, message: error.message })
  }

  // Invites the user RECEIVED (keyed by their email, not owner_id) — erase those too.
  if (email) {
    const { error } = await admin.from('team_invites').delete().ilike('email', email)
    if (error) errors.push({ scope: 'delete:team_invites:received', message: error.message })
  }

  // Erase buyer PII on sellers' transaction records (case-insensitive email match).
  if (email) {
    for (const { table, columns } of BUYER_PII_TABLES) {
      const patch = Object.fromEntries(columns.map((c) => [c, null]))
      const { error } = await admin.from(table).update(patch).ilike('buyer_email', email)
      if (error) errors.push({ scope: `anonymize:${table}`, message: error.message })
    }
  }

  // Delete the auth user LAST — this is the "can't sign back in" guarantee.
  const authUserDeleted = await deleteAuthUser(admin, userId)
  if (!authUserDeleted) errors.push({ scope: 'auth.deleteUser', message: 'Failed to delete the auth user.' })

  return { ok: authUserDeleted, authUserDeleted, errors }
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
export const __DELETE_ACCOUNT_TABLES = { USER_ID_TABLES, OWNER_ID_TABLES, BUYER_PII_TABLES }
