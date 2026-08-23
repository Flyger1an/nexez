import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export const DASHBOARD_ORDER_PAGE_SIZE = 25

const ORDER_SELECT = [
  'id',
  'owner_id',
  'page_id',
  'slug',
  'offer_name',
  'offer_key',
  'amount_cents',
  'currency',
  'status',
  'channel',
  'refunded_cents',
  'buyer_email',
  'buyer_name',
  'buyer_reference',
  'buyer_agent',
  'commission_bps',
  'commission_percent',
  'application_fee_cents',
  'plan_id_at_purchase',
  'commission_source',
  'stripe_livemode',
  'stripe_session_id',
  'stripe_payment_intent_id',
  'stripe_invoice_id',
  'service_agreement_id',
  'service_period_start',
  'service_period_end',
  'staged_settlement_agreement_id',
  'staged_settlement_obligation_id',
  'resource_hold_id',
  'metadata',
  'created_at',
  'updated_at',
].join(',')

const ORDER_STATUSES = new Set(['paid', 'partial_refund', 'refunded', 'disputed', 'dispute_won'])

export type DashboardOrder = {
  id: string
  owner_id: string
  page_id: string | null
  slug: string | null
  offer_name: string | null
  offer_key: string | null
  amount_cents: number
  currency: string
  status: string
  channel: string | null
  refunded_cents: number | null
  buyer_email: string | null
  buyer_name: string | null
  buyer_reference: string | null
  buyer_agent: string | null
  commission_bps: number | null
  commission_percent: number | null
  application_fee_cents: number | null
  plan_id_at_purchase: string | null
  commission_source: string | null
  stripe_livemode: boolean | null
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_invoice_id: string | null
  service_agreement_id: string | null
  service_period_start: string | null
  service_period_end: string | null
  staged_settlement_agreement_id: string | null
  staged_settlement_obligation_id: string | null
  resource_hold_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type DashboardOrderFilters = {
  q: string
  status: string
  channel: string
  currency: string
  page: number
}

export type DashboardOrderList = {
  orders: DashboardOrder[]
  total: number
  pages: number
  filters: DashboardOrderFilters
  error: string | null
}

export type DashboardOrderRequest = {
  id: string
  kind: 'refund_request' | 'problem_report'
  status: string
  message: string | null
  buyer_email: string | null
  created_at: string
  updated_at: string
}

export type DashboardOrderFulfillment = {
  order_id: string
  status: 'not_started' | 'in_progress' | 'fulfilled'
  version: number
  started_at: string | null
  fulfilled_at: string | null
  updated_at: string
}

export type DashboardOrderEvent = {
  id: string
  event_type: string
  source: 'system' | 'merchant' | 'buyer' | 'stripe'
  actor_user_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type DashboardOrderReview = {
  id: string
  rating: number
  title: string | null
  body: string | null
  tags: unknown
  status: string
  seller_response: string | null
  created_at: string
}

export type StagedSettlementAgreement = {
  id: string
  status: string
  total_amount_cents: number
  currency: string
  offer_name: string
  buyer_name: string | null
  buyer_email: string | null
  completed_at: string | null
  created_at: string
}

export type StagedSettlementObligation = {
  id: string
  stage_id: string
  stage_order: number
  label: string
  kind: string
  amount_cents: number
  status: string
  stripe_livemode: boolean | null
  application_fee_cents: number | null
  paid_at: string | null
  refunded_at: string | null
  disputed_at: string | null
}

export type ServiceAgreementSummary = {
  id: string
  status: string
  amount_per_period_cents: number
  currency: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export type ResourceReservationSummary = {
  id: string
  status: string
  allocation_snapshot: unknown
  committed_at: string
  cancelled_at: string | null
  fulfilled_at: string | null
}

export type DashboardOrderDetail = {
  order: DashboardOrder
  fulfillment: DashboardOrderFulfillment | null
  events: DashboardOrderEvent[]
  requests: DashboardOrderRequest[]
  reviews: DashboardOrderReview[]
  stagedAgreement: StagedSettlementAgreement | null
  stagedObligations: StagedSettlementObligation[]
  serviceAgreement: ServiceAgreementSummary | null
  resourceReservation: ResourceReservationSummary | null
  issues: string[]
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export function normalizeOrderSearch(value: string) {
  return value
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function parseDashboardOrderFilters(input: Record<string, string | string[] | undefined>): DashboardOrderFilters {
  const q = normalizeOrderSearch(first(input.q))
  const requestedStatus = first(input.status).toLowerCase()
  const status = ORDER_STATUSES.has(requestedStatus) ? requestedStatus : ''
  const requestedChannel = first(input.channel).toLowerCase()
  const channel = /^[a-z][a-z0-9_]{0,39}$/.test(requestedChannel) ? requestedChannel : ''
  const requestedCurrency = first(input.currency).toLowerCase()
  const currency = /^[a-z]{3}$/.test(requestedCurrency) ? requestedCurrency : ''
  const requestedPage = Number(first(input.page))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  return { q, status, channel, currency, page }
}

export async function loadDashboardOrders(
  supabase: SupabaseClient,
  ownerId: string,
  rawFilters: Record<string, string | string[] | undefined>,
): Promise<DashboardOrderList> {
  const filters = parseDashboardOrderFilters(rawFilters)
  const from = (filters.page - 1) * DASHBOARD_ORDER_PAGE_SIZE
  const to = from + DASHBOARD_ORDER_PAGE_SIZE - 1
  let query = supabase
    .from('checkout_orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .eq('owner_id', ownerId)

  if (filters.q) {
    const match = `%${filters.q}%`
    query = query.or([
      `offer_name.ilike.${match}`,
      `slug.ilike.${match}`,
      `buyer_name.ilike.${match}`,
      `buyer_email.ilike.${match}`,
      `buyer_reference.ilike.${match}`,
    ].join(','))
  }
  if (filters.status === 'partial_refund') {
    query = query.eq('status', 'paid').gt('refunded_cents', 0)
  } else if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.channel) query = query.eq('channel', filters.channel)
  if (filters.currency) query = query.eq('currency', filters.currency)

  const result = await query
    .order('created_at', { ascending: false })
    .range(from, to)
    .returns<DashboardOrder[]>()

  if (result.error) {
    return {
      orders: [],
      total: 0,
      pages: 1,
      filters,
      error: 'Orders could not be loaded.',
    }
  }

  const total = result.count ?? result.data?.length ?? 0
  return {
    orders: result.data ?? [],
    total,
    pages: Math.max(1, Math.ceil(total / DASHBOARD_ORDER_PAGE_SIZE)),
    filters,
    error: null,
  }
}

export async function loadDashboardOrderDetail(
  supabase: SupabaseClient,
  ownerId: string,
  orderId: string,
): Promise<DashboardOrderDetail | null> {
  const orderResult = await supabase
    .from('checkout_orders')
    .select(ORDER_SELECT)
    .eq('owner_id', ownerId)
    .eq('id', orderId)
    .maybeSingle<DashboardOrder>()

  if (orderResult.error || !orderResult.data) return null
  const order = orderResult.data

  const [fulfillmentResult, eventResult, requestResult, reviewResult, stagedAgreementResult, stagedObligationResult, serviceAgreementResult, reservationResult] = await Promise.all([
    supabase
      .from('checkout_order_fulfillments')
      .select('order_id, status, version, started_at, fulfilled_at, updated_at')
      .eq('owner_id', ownerId)
      .eq('order_id', order.id)
      .maybeSingle<DashboardOrderFulfillment>(),
    supabase
      .from('checkout_order_events')
      .select('id, event_type, source, actor_user_id, metadata, created_at')
      .eq('owner_id', ownerId)
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .returns<DashboardOrderEvent[]>(),
    supabase
      .from('order_requests')
      .select('id, kind, status, message, buyer_email, created_at, updated_at')
      .eq('owner_id', ownerId)
      .eq('order_kind', 'checkout')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .returns<DashboardOrderRequest[]>(),
    supabase
      .from('order_reviews')
      .select('id, rating, title, body, tags, status, seller_response, created_at')
      .eq('owner_id', ownerId)
      .eq('order_kind', 'checkout')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .returns<DashboardOrderReview[]>(),
    order.staged_settlement_agreement_id
      ? supabase
          .from('staged_settlement_agreements')
          .select('id, status, total_amount_cents, currency, offer_name, buyer_name, buyer_email, completed_at, created_at')
          .eq('owner_id', ownerId)
          .eq('id', order.staged_settlement_agreement_id)
          .maybeSingle<StagedSettlementAgreement>()
      : Promise.resolve({ data: null, error: null }),
    order.staged_settlement_agreement_id
      ? supabase
          .from('staged_settlement_obligations')
          .select('id, stage_id, stage_order, label, kind, amount_cents, status, stripe_livemode, application_fee_cents, paid_at, refunded_at, disputed_at')
          .eq('agreement_id', order.staged_settlement_agreement_id)
          .order('stage_order', { ascending: true })
          .returns<StagedSettlementObligation[]>()
      : Promise.resolve({ data: [], error: null }),
    order.service_agreement_id
      ? supabase
          .from('service_agreements')
          .select('id, status, amount_per_period_cents, currency, current_period_start, current_period_end, cancel_at_period_end')
          .eq('owner_id', ownerId)
          .eq('id', order.service_agreement_id)
          .maybeSingle<ServiceAgreementSummary>()
      : Promise.resolve({ data: null, error: null }),
    order.resource_hold_id
      ? supabase
          .from('resource_reservations')
          .select('id, status, allocation_snapshot, committed_at, cancelled_at, fulfilled_at')
          .eq('owner_id', ownerId)
          .eq('checkout_order_id', order.id)
          .maybeSingle<ResourceReservationSummary>()
      : Promise.resolve({ data: null, error: null }),
  ])

  const issues = [
    fulfillmentResult.error ? 'fulfillment state' : null,
    eventResult.error ? 'activity timeline' : null,
    requestResult.error ? 'buyer requests' : null,
    reviewResult.error ? 'verified review' : null,
    stagedAgreementResult.error ? 'staged agreement' : null,
    stagedObligationResult.error ? 'staged payment schedule' : null,
    serviceAgreementResult.error ? 'recurring agreement' : null,
    reservationResult.error ? 'resource reservation' : null,
  ].filter((issue): issue is string => Boolean(issue))

  return {
    order,
    fulfillment: fulfillmentResult.data ?? null,
    events: eventResult.data ?? [],
    requests: requestResult.data ?? [],
    reviews: reviewResult.data ?? [],
    stagedAgreement: stagedAgreementResult.data ?? null,
    stagedObligations: stagedObligationResult.data ?? [],
    serviceAgreement: serviceAgreementResult.data ?? null,
    resourceReservation: reservationResult.data ?? null,
    issues,
  }
}
