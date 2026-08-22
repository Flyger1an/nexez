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

const EXPORT_PAGE_SIZE = 500

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
  'agent_lab_research_runs',
  'agent_lab_simulation_runs',
  'pages',
  'storefronts',
  'support_tickets',
  'billing_subscriptions',
  'checkout_events',
  'agent_visits',
  'agent_negotiations',
  'intake_sessions',
  'outbound_webhooks',
  'promotional_plan_grants',
  'seller_growth_events',
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
  manifest: {
    complete: boolean
    pageSize: number
    datasets: Record<string, { rows: number; complete: boolean; error?: string }>
    errors: Array<{ dataset: string; message: string }>
  }
}

type ExportQueryResult = {
  data: unknown[] | null
  error: { message?: string } | null
}

type ExportQueryFactory = (from: number, to: number) => PromiseLike<ExportQueryResult>

async function readEveryRow(query: ExportQueryFactory): Promise<{
  rows: unknown[]
  complete: boolean
  error?: string
}> {
  const rows: unknown[] = []

  for (let page = 0; ; page += 1) {
    const from = page * EXPORT_PAGE_SIZE
    const { data, error } = await query(from, from + EXPORT_PAGE_SIZE - 1)
    if (error) {
      return {
        rows,
        complete: false,
        error: error.message || 'The dataset could not be read.',
      }
    }

    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < EXPORT_PAGE_SIZE) return { rows, complete: true }
  }
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
  const manifest: AccountExport['manifest'] = {
    complete: true,
    pageSize: EXPORT_PAGE_SIZE,
    datasets: {},
    errors: [],
  }
  const put = (
    facet: keyof AccountExport['facets'],
    key: string,
    result: { rows: unknown[]; complete: boolean; error?: string },
  ) => {
    data[key] = result.rows
    facets[facet].push(key)
    manifest.datasets[key] = {
      rows: result.rows.length,
      complete: result.complete,
      ...(result.error ? { error: result.error } : {}),
    }
    if (!result.complete) {
      manifest.complete = false
      manifest.errors.push({ dataset: key, message: result.error || 'The dataset is incomplete.' })
    }
  }

  const buyerOwned = await Promise.all(BUYER_USER_ID_TABLES.map(async (table) => ({
    table,
    result: await readEveryRow((from, to) =>
      admin.from(table).select('*').eq('user_id', userId).order('id', { ascending: true }).range(from, to),
    ),
  })))
  for (const { table, result } of buyerOwned) {
    put('buyer', table, result)
  }
  // Referral graph rows name the user on either side.
  for (const column of ['referrer_user_id', 'referred_user_id'] as const) {
    const key = `referrals_as_${column === 'referrer_user_id' ? 'referrer' : 'referred'}`
    put('buyer', key, await readEveryRow((from, to) =>
      admin.from('referrals').select('*').eq(column, userId).order('id', { ascending: true }).range(from, to),
    ))
  }

  if (email) {
    const escaped = escapeLike(email)
    const buyerRecords = await Promise.all(BUYER_EMAIL_TABLES.map(async (table) => ({
      table,
      result: await readEveryRow((from, to) =>
        admin.from(table).select('*').ilike('buyer_email', escaped).order('id', { ascending: true }).range(from, to),
      ),
    })))
    for (const { table, result } of buyerRecords) {
      put('buyer', `${table}_as_buyer`, result)
    }
    // The buyer's own chat turns on sellers' negotiations (the transcripts the
    // deletion path erases - R5) - export them too, matched the same way.
    const buyerNegotiations = await readEveryRow((from, to) =>
      admin
        .from('agent_negotiations')
        .select('id')
        .or(`buyer_email.ilike.${escaped},contact.ilike.${escaped}`)
        .order('id', { ascending: true })
        .range(from, to),
    )
    const negotiationIds = buyerNegotiations.rows
      .map((row) => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (negotiationIds.length) {
      const messageResults = await Promise.all(
        Array.from({ length: Math.ceil(negotiationIds.length / 100) }, (_, index) => negotiationIds.slice(index * 100, (index + 1) * 100))
          .map((ids) => readEveryRow((from, to) =>
            admin
              .from('negotiation_messages')
              .select('*')
              .in('negotiation_id', ids)
              .eq('role', 'buyer')
              .order('id', { ascending: true })
              .range(from, to),
          )),
      )
      const failed = messageResults.find((result) => !result.complete)
      put('buyer', 'negotiation_messages_as_buyer', {
        rows: messageResults.flatMap((result) => result.rows),
        complete: buyerNegotiations.complete && !failed,
        error: !buyerNegotiations.complete
          ? buyerNegotiations.error
          : failed?.error,
      })
    } else {
      put('buyer', 'negotiation_messages_as_buyer', {
        rows: [],
        complete: buyerNegotiations.complete,
        error: buyerNegotiations.error,
      })
    }
    // Invites addressed to this user (collaborator side of team_invites).
    put('buyer', 'team_invites_as_invitee', await readEveryRow((from, to) =>
      admin.from('team_invites').select('*').ilike('email', escaped).order('id', { ascending: true }).range(from, to),
    ))
  } else {
    for (const table of BUYER_EMAIL_TABLES) {
      put('buyer', `${table}_as_buyer`, { rows: [], complete: true })
    }
    put('buyer', 'negotiation_messages_as_buyer', { rows: [], complete: true })
    put('buyer', 'team_invites_as_invitee', { rows: [], complete: true })
  }

  const sellerOwned = await Promise.all(SELLER_OWNER_ID_TABLES.map(async (table) => ({
    table,
    result: await readEveryRow((from, to) =>
      admin.from(table).select('*').eq('owner_id', userId).order('id', { ascending: true }).range(from, to),
    ),
  })))
  for (const { table, result } of sellerOwned) {
    put('seller', table, result)
  }

  // Seller-acquisition invitations use inviter_owner_id / accepted_by_owner_id
  // instead of the usual owner_id. Export only owner-safe columns: token_hash is
  // a live bearer credential and must never appear in a data archive.
  const growthInviteFields =
    'id, campaign_id, inviter_owner_id, inviter_business_name, invitee_email, status, expires_at, accepted_by_owner_id, accepted_at, qualified_at, invitee_grant_id, delivery_count, last_sent_at, created_at, updated_at'
  put('seller', 'seller_growth_invites_as_sender', await readEveryRow((from, to) =>
    admin.from('seller_growth_invites').select(growthInviteFields).eq('inviter_owner_id', userId).order('id', { ascending: true }).range(from, to),
  ))
  put('seller', 'seller_growth_invites_as_recipient', await readEveryRow((from, to) =>
    admin.from('seller_growth_invites').select(growthInviteFields).eq('accepted_by_owner_id', userId).order('id', { ascending: true }).range(from, to),
  ))
  if (email) {
    put('seller', 'seller_growth_invites_addressed_to_email', await readEveryRow((from, to) =>
      admin.from('seller_growth_invites').select(growthInviteFields).ilike('invitee_email', escapeLike(email)).order('id', { ascending: true }).range(from, to),
    ))
  } else {
    put('seller', 'seller_growth_invites_addressed_to_email', { rows: [], complete: true })
  }

  const grantIds = ((data.promotional_plan_grants ?? []) as Array<{ id?: string }>)
    .map((grant) => grant.id)
    .filter((id): id is string => Boolean(id))
  if (grantIds.length) {
    const grantChunks = Array.from(
      { length: Math.ceil(grantIds.length / 100) },
      (_, index) => grantIds.slice(index * 100, (index + 1) * 100),
    )
    const [claimResults, noticeResults] = await Promise.all([
      Promise.all(grantChunks.map((ids) => readEveryRow((from, to) =>
        admin.from('seller_growth_business_claims').select('*').in('grant_id', ids).order('id', { ascending: true }).range(from, to),
      ))),
      Promise.all(grantChunks.map((ids) => readEveryRow((from, to) =>
        admin.from('promotional_grant_notices').select('*').in('grant_id', ids).order('id', { ascending: true }).range(from, to),
      ))),
    ])
    put('seller', 'seller_growth_business_claims', mergeResults(claimResults))
    put('seller', 'promotional_grant_notices', mergeResults(noticeResults))
  } else {
    put('seller', 'seller_growth_business_claims', { rows: [], complete: true })
    put('seller', 'promotional_grant_notices', { rows: [], complete: true })
  }

  const accountOwned = await Promise.all(ACCOUNT_USER_ID_TABLES.map(async (table) => ({
    table,
    result: await readEveryRow((from, to) =>
      admin.from(table).select('*').eq('user_id', userId).order('id', { ascending: true }).range(from, to),
    ),
  })))
  for (const { table, result } of accountOwned) {
    put('account', table, result)
  }

  // API keys: metadata only - NEVER export the key hash.
  put('seller', 'api_keys', await readEveryRow((from, to) =>
    admin
      .from('api_keys')
      .select('id, name, prefix, last_used_at, revoked_at, created_at')
      .eq('owner_id', userId)
      .order('id', { ascending: true })
      .range(from, to),
  ))

  return { account: { id: userId, email, exportedAt }, data, facets, manifest }
}

function mergeResults(results: Array<{ rows: unknown[]; complete: boolean; error?: string }>) {
  const failed = results.find((result) => !result.complete)
  return {
    rows: results.flatMap((result) => result.rows),
    complete: !failed,
    error: failed?.error,
  }
}
