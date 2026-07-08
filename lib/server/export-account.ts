import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { escapeLike } from './sql-escape'

// GDPR/CCPA data export: gather the personal data we hold about a user into one JSON object.
// Service-role reads (so it works for both the web cookie session and the Nexxi bearer token);
// callers MUST authenticate + authorize the user first. Secrets are excluded - api_keys are
// exported as metadata only (never key_hash) and page_secrets are omitted entirely.
//
// FACET-ATTRIBUTED: one login is both a Nexxi BUYER and a Nexez SELLER (see
// lib/server/delete-account.ts, whose facet lists this mirrors). Every data key
// is attributed to its facet in `facets`, and the table coverage matches what
// deletion would erase - if deletion touches it, export must return it.

const ROW_CAP = 5000

/** BUYER facet: the personal buyer-agent data, keyed by the auth user id. */
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

/** Records where the user is the BUYER on sellers' records (matched by email);
 *  output keyed `<table>_as_buyer`. */
const BUYER_EMAIL_TABLES = ['checkout_orders', 'agent_negotiations', 'order_requests'] as const

/** SELLER facet: business data this account owns. */
const SELLER_OWNER_ID_TABLES = [
  'pages',
  'storefronts',
  'support_tickets',
  'billing_subscriptions',
  'checkout_events',
  'agent_visits',
  'agent_negotiations',
  'intake_sessions',
  'outbound_webhooks',
  'sent_system_emails',
  'team_invites',
] as const

/** Account-level (spans both facets), keyed by user_id. */
const ACCOUNT_USER_ID_TABLES = ['user_integrations'] as const

export const __EXPORT_ACCOUNT_TABLES = {
  BUYER_USER_ID_TABLES,
  BUYER_EMAIL_TABLES,
  SELLER_OWNER_ID_TABLES,
  ACCOUNT_USER_ID_TABLES,
}

export type AccountExport = {
  account: { id: string; email: string | null; exportedAt: string }
  data: Record<string, unknown[]>
  /** Which facet each `data` key belongs to (buyer = Nexxi, seller = Nexez). */
  facets: { buyer: string[]; seller: string[]; account: string[] }
}

export async function exportUserAccount(
  userId: string,
  email: string | null,
  exportedAt: string,
): Promise<AccountExport | null> {
  if (!hasSupabaseAdminEnv()) return null
  const admin = createAdminClient()
  const data: Record<string, unknown[]> = {}
  const facets: AccountExport['facets'] = { buyer: [], seller: [], account: [] }
  const put = (facet: keyof AccountExport['facets'], key: string, rows: unknown[] | null) => {
    data[key] = rows ?? []
    facets[facet].push(key)
  }

  for (const table of BUYER_USER_ID_TABLES) {
    const { data: rows } = await admin.from(table).select('*').eq('user_id', userId).limit(ROW_CAP)
    put('buyer', table, rows)
  }
  // Referral graph rows name the user on either side.
  for (const column of ['referrer_user_id', 'referred_user_id'] as const) {
    const { data: rows } = await admin.from('referrals').select('*').eq(column, userId).limit(ROW_CAP)
    put('buyer', `referrals_as_${column === 'referrer_user_id' ? 'referrer' : 'referred'}`, rows)
  }

  if (email) {
    const escaped = escapeLike(email)
    for (const table of BUYER_EMAIL_TABLES) {
      const { data: rows } = await admin.from(table).select('*').ilike('buyer_email', escaped).limit(ROW_CAP)
      put('buyer', `${table}_as_buyer`, rows)
    }
    // The buyer's own chat turns on sellers' negotiations (the transcripts the
    // deletion path erases - R5) - export them too, matched the same way.
    const { data: buyerNegotiations } = await admin
      .from('agent_negotiations')
      .select('id')
      .or(`buyer_email.ilike.${escaped},contact.ilike.${escaped}`)
      .limit(ROW_CAP)
    const negotiationIds = (buyerNegotiations ?? []).map((row: { id: string }) => row.id)
    if (negotiationIds.length) {
      const { data: rows } = await admin
        .from('negotiation_messages')
        .select('*')
        .in('negotiation_id', negotiationIds)
        .eq('role', 'buyer')
        .limit(ROW_CAP)
      put('buyer', 'negotiation_messages_as_buyer', rows)
    } else {
      put('buyer', 'negotiation_messages_as_buyer', [])
    }
    // Invites addressed to this user (collaborator side of team_invites).
    const { data: invitee } = await admin.from('team_invites').select('*').ilike('email', escaped).limit(ROW_CAP)
    put('buyer', 'team_invites_as_invitee', invitee)
  }

  for (const table of SELLER_OWNER_ID_TABLES) {
    const { data: rows } = await admin.from(table).select('*').eq('owner_id', userId).limit(ROW_CAP)
    put('seller', table, rows)
  }

  for (const table of ACCOUNT_USER_ID_TABLES) {
    const { data: rows } = await admin.from(table).select('*').eq('user_id', userId).limit(ROW_CAP)
    put('account', table, rows)
  }

  // API keys: metadata only - NEVER export the key hash.
  const { data: apiKeys } = await admin
    .from('api_keys')
    .select('id, name, prefix, last_used_at, revoked_at, created_at')
    .eq('owner_id', userId)
  put('seller', 'api_keys', apiKeys)

  return { account: { id: userId, email, exportedAt }, data, facets }
}
