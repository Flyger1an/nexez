import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

// GDPR/CCPA data export: gather the personal data we hold about a user into one JSON object.
// Service-role reads (so it works for both the web cookie session and the Nxxi bearer token);
// callers MUST authenticate + authorize the user first. Secrets are excluded — api_keys are
// exported as metadata only (never key_hash) and page_secrets are omitted entirely.

const ROW_CAP = 5000

/** Agent + personal data, keyed by the auth user id. */
const USER_ID_TABLES = [
  'user_agents',
  'agent_threads',
  'agent_messages',
  'agent_action_approvals',
  'user_push_tokens',
  'user_integrations',
] as const

/** Seller-side data this account owns. */
const OWNER_ID_TABLES = [
  'pages',
  'support_tickets',
  'billing_subscriptions',
  'checkout_events',
  'agent_visits',
  'agent_negotiations',
] as const

/** Records where the user is the BUYER (matched by email); output keyed `<table>_as_buyer`. */
const BUYER_EMAIL_TABLES = ['checkout_orders', 'agent_negotiations', 'order_requests'] as const

export const __EXPORT_ACCOUNT_TABLES = { USER_ID_TABLES, OWNER_ID_TABLES, BUYER_EMAIL_TABLES }

export type AccountExport = {
  account: { id: string; email: string | null; exportedAt: string }
  data: Record<string, unknown[]>
}

export async function exportUserAccount(
  userId: string,
  email: string | null,
  exportedAt: string,
): Promise<AccountExport | null> {
  if (!hasSupabaseAdminEnv()) return null
  const admin = createAdminClient()
  const data: Record<string, unknown[]> = {}

  for (const table of USER_ID_TABLES) {
    const { data: rows } = await admin.from(table).select('*').eq('user_id', userId).limit(ROW_CAP)
    data[table] = rows ?? []
  }
  for (const table of OWNER_ID_TABLES) {
    const { data: rows } = await admin.from(table).select('*').eq('owner_id', userId).limit(ROW_CAP)
    data[table] = rows ?? []
  }
  if (email) {
    for (const table of BUYER_EMAIL_TABLES) {
      const { data: rows } = await admin.from(table).select('*').ilike('buyer_email', email).limit(ROW_CAP)
      data[`${table}_as_buyer`] = rows ?? []
    }
  }

  // API keys: metadata only — NEVER export the key hash.
  const { data: apiKeys } = await admin
    .from('api_keys')
    .select('id, name, prefix, last_used_at, revoked_at, created_at')
    .eq('owner_id', userId)
  data.api_keys = apiKeys ?? []

  return { account: { id: userId, email, exportedAt }, data }
}
