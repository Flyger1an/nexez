/**
 * One contract for buyer data held on seller-owned records.
 *
 * Account export and buyer-facet deletion both consume this manifest. Adding a
 * new direct buyer identity surface without declaring its lookup, export, and
 * anonymization behavior is covered by privacy-contract.test.ts.
 */

export const DIRECT_BUYER_IDENTITY_COLUMNS = [
  'buyer_email',
  'buyer_name',
  'buyer_reference',
  'buyer_agent',
] as const

/** Buyer-facet datasets owned directly by the auth user. Export returns these
 * rows and erasure deletes them, so this list must never drift between paths. */
export const BUYER_USER_ID_TABLES = [
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

export type BuyerJsonScrub = 'checkout-buyer' | 'recurring-contract' | 'staged-contract'

export type BuyerDataContract = {
  table: string
  dataset: string
  exportProjection: string
  emailColumns: readonly string[]
  referenceColumn: string | null
  anonymizeColumns: readonly string[]
  jsonColumn?: string
  jsonScrub?: BuyerJsonScrub
}

const CHECKOUT_ORDER_EXPORT = [
  'id', 'owner_id', 'page_id', 'slug', 'offer_name', 'offer_key',
  'stripe_session_id', 'stripe_payment_intent_id', 'stripe_connect_account_id',
  'amount_cents', 'currency', 'application_fee_cents', 'status', 'metadata',
  'created_at', 'updated_at', 'buyer_email', 'refunded_cents', 'buyer_name',
  'buyer_reference', 'buyer_agent', 'commission_percent', 'channel',
  'stripe_livemode', 'commission_bps', 'plan_id_at_purchase',
  'commission_source', 'service_agreement_id', 'stripe_invoice_id',
  'service_period_start', 'service_period_end',
  'staged_settlement_agreement_id', 'staged_settlement_obligation_id',
  'resource_hold_id',
].join(', ')

const AGENT_NEGOTIATION_EXPORT = [
  'id', 'page_id', 'owner_id', 'slug', 'offer_key', 'offer_name', 'offer_kind',
  'buyer_agent', 'buyer_query', 'requested_terms', 'budget_text',
  'timeline_text', 'contact', 'status', 'escrow_mode', 'amount_cents',
  'currency', 'stripe_payment_intent_id', 'metadata', 'created_at',
  'updated_at', 'settlement_state', 'stripe_checkout_session_id',
  'decision_pending', 'decision_requested_at', 'decision_seq',
  'decision_claimed_at', 'buyer_email', 'refunded_cents',
  'commission_percent', 'application_fee_cents', 'calendly_event_uri',
  'calendly_cancelled_at', 'stripe_livemode', 'commission_bps',
  'plan_id_at_purchase', 'commission_source',
].join(', ')

export const SERVICE_AGREEMENT_EXPORT = [
  'id', 'owner_id', 'page_id', 'slug', 'offer_key', 'offer_name', 'status',
  'contract_snapshot', 'contract_fingerprint', 'amount_per_period_cents',
  'currency', 'stripe_connect_account_id', 'stripe_checkout_session_id',
  'stripe_subscription_id', 'stripe_livemode', 'request_idempotency_key',
  'commission_bps', 'plan_id_at_purchase', 'commission_source', 'buyer_email',
  'buyer_name', 'buyer_reference', 'buyer_agent', 'current_period_start',
  'current_period_end', 'cancel_at_period_end', 'started_at', 'canceled_at',
  'created_at', 'updated_at',
].join(', ')

export const STAGED_SETTLEMENT_AGREEMENT_EXPORT = [
  'id', 'owner_id', 'page_id', 'slug', 'offer_key', 'offer_name', 'status',
  'contract_snapshot', 'contract_fingerprint', 'total_amount_cents', 'currency',
  'stripe_connect_account_id', 'request_idempotency_key', 'commission_bps',
  'plan_id_at_purchase', 'commission_source', 'buyer_email', 'buyer_name',
  'buyer_reference', 'buyer_agent', 'completed_at', 'cancelled_at',
  'created_at', 'updated_at',
].join(', ')

export const BUYER_DATA_CONTRACT: readonly BuyerDataContract[] = [
  {
    table: 'agent_negotiations',
    dataset: 'agent_negotiations_as_buyer',
    exportProjection: AGENT_NEGOTIATION_EXPORT,
    emailColumns: ['buyer_email', 'contact'],
    referenceColumn: null,
    anonymizeColumns: ['buyer_email', 'contact', 'buyer_query', 'budget_text', 'timeline_text', 'buyer_agent'],
  },
  {
    table: 'checkout_orders',
    dataset: 'checkout_orders_as_buyer',
    exportProjection: CHECKOUT_ORDER_EXPORT,
    emailColumns: ['buyer_email'],
    referenceColumn: 'buyer_reference',
    anonymizeColumns: DIRECT_BUYER_IDENTITY_COLUMNS,
  },
  {
    table: 'order_requests',
    dataset: 'order_requests_as_buyer',
    exportProjection: '*',
    emailColumns: ['buyer_email'],
    referenceColumn: null,
    anonymizeColumns: ['buyer_email', 'message'],
  },
  {
    table: 'service_agreements',
    dataset: 'service_agreements_as_buyer',
    exportProjection: SERVICE_AGREEMENT_EXPORT,
    emailColumns: ['buyer_email'],
    referenceColumn: 'buyer_reference',
    anonymizeColumns: DIRECT_BUYER_IDENTITY_COLUMNS,
    jsonColumn: 'contract_snapshot',
    jsonScrub: 'recurring-contract',
  },
  {
    table: 'staged_settlement_agreements',
    dataset: 'staged_settlement_agreements_as_buyer',
    exportProjection: STAGED_SETTLEMENT_AGREEMENT_EXPORT,
    emailColumns: ['buyer_email'],
    referenceColumn: 'buyer_reference',
    anonymizeColumns: DIRECT_BUYER_IDENTITY_COLUMNS,
    jsonColumn: 'contract_snapshot',
    jsonScrub: 'staged-contract',
  },
  {
    table: 'checkout_sessions',
    dataset: 'checkout_sessions_as_buyer',
    exportProjection: '*',
    emailColumns: ['buyer->>email'],
    referenceColumn: 'buyer->>reference',
    anonymizeColumns: [],
    jsonColumn: 'buyer',
    jsonScrub: 'checkout-buyer',
  },
]

export type BuyerMatch = { kind: 'reference' | 'email'; column: string; value: string }

export function buyerMatches(
  contract: BuyerDataContract,
  userId: string,
  email: string | null,
): BuyerMatch[] {
  return [
    ...(contract.referenceColumn
      ? [{ kind: 'reference' as const, column: contract.referenceColumn, value: userId }]
      : []),
    ...(email
      ? contract.emailColumns.map((column) => ({ kind: 'email' as const, column, value: email }))
      : []),
  ]
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function withoutKeys(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const source = record(value)
  if (!source) return null
  const clean = { ...source }
  for (const key of keys) delete clean[key]
  return Object.keys(clean).length ? clean : null
}

function scrubPricing(value: unknown): unknown {
  const pricing = record(value)
  if (!pricing) return value
  const adjustments = Array.isArray(pricing.adjustments)
    ? pricing.adjustments.map((entry) => withoutKeys(entry, ['value']) ?? {})
    : pricing.adjustments
  return { ...pricing, ...(Array.isArray(pricing.adjustments) ? { adjustments } : {}) }
}

function scrubRecurringContract(value: unknown): unknown {
  const snapshot = record(value)
  if (!snapshot) return value
  const resolvedSchedule = withoutKeys(snapshot.resolvedSchedule, ['inputValue'])
  return {
    ...snapshot,
    configuration: {},
    ...(resolvedSchedule ? { resolvedSchedule } : {}),
    ...(snapshot.pricing != null ? { pricing: scrubPricing(snapshot.pricing) } : {}),
  }
}

function scrubStagedContract(value: unknown): unknown {
  const snapshot = record(value)
  return snapshot ? { ...snapshot, offerConfiguration: {} } : value
}

export function buyerAnonymizationPatch(
  contract: BuyerDataContract,
  row?: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = Object.fromEntries(
    contract.anonymizeColumns.map((column) => [column, null]),
  )
  if (!contract.jsonColumn || !contract.jsonScrub || !row) return patch

  const value = row[contract.jsonColumn]
  if (contract.jsonScrub === 'checkout-buyer') {
    patch[contract.jsonColumn] = withoutKeys(value, ['email', 'name', 'reference', 'agent'])
  } else if (contract.jsonScrub === 'recurring-contract') {
    patch[contract.jsonColumn] = scrubRecurringContract(value)
  } else {
    patch[contract.jsonColumn] = scrubStagedContract(value)
  }
  return patch
}
