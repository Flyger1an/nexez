import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkoutCommerceActionRecord,
  mergeCommerceActionRecords,
  negotiatedCommerceActionRecord,
  type CommerceActionRecord,
  type CommerceBuyerRequestSource,
  type CommerceFulfillmentActionSource,
  type NegotiatedCommerceActionSource,
} from '../commerce-actions'
import type { CheckoutCommerceSource } from '../commerce-record'
import {
  CHECKOUT_COMMERCE_SELECT,
  NEGOTIATED_COMMERCE_SELECT,
} from './dashboard-commerce'

export const DASHBOARD_COMMERCE_ACTION_LIMIT = 25
export const DASHBOARD_COMMERCE_ACTION_SOURCE_LIMIT = 100

const NEGOTIATED_ACTION_SELECT = [
  NEGOTIATED_COMMERCE_SELECT,
  'settlement_state',
  'decision_pending',
  'metadata',
].join(',')

const NEGOTIATION_ACTION_STATUSES = [
  'disputed',
  'held',
  'agreement_proposed',
  'paused',
  'negotiation',
]

type QueryResult<T> = {
  data: T[] | null
  error: { message?: string } | null
  count?: number | null
}

export type DashboardCommerceActionResult = {
  actions: CommerceActionRecord[]
  urgentCount: number
  isTruncated: boolean
  issues: string[]
}

function rows<T>(result: QueryResult<T>) {
  return result.error ? [] : result.data ?? []
}

function wasTruncated(result: { data: unknown[] | null; count?: number | null }) {
  return result.count != null && result.count > (result.data?.length ?? 0)
}

function groupRequests(requests: CommerceBuyerRequestSource[]) {
  const grouped = new Map<string, CommerceBuyerRequestSource[]>()
  for (const request of requests) {
    const key = `${request.order_kind}:${request.order_id}`
    grouped.set(key, [...(grouped.get(key) ?? []), request])
  }
  return grouped
}

export async function loadDashboardCommerceActions(
  supabase: SupabaseClient,
  ownerId: string,
  now = Date.now(),
): Promise<DashboardCommerceActionResult> {
  const [requestResult, fulfillmentResult, disputedCheckoutResult, negotiationCandidateResult] = await Promise.all([
    supabase
      .from('order_requests')
      .select('id, order_kind, order_id, kind, status, updated_at', { count: 'exact' })
      .eq('owner_id', ownerId)
      .in('status', ['open', 'acknowledged'])
      .order('updated_at', { ascending: false })
      .limit(DASHBOARD_COMMERCE_ACTION_SOURCE_LIMIT)
      .returns<CommerceBuyerRequestSource[]>(),
    supabase
      .from('checkout_order_fulfillments')
      .select('order_id, status, updated_at', { count: 'exact' })
      .eq('owner_id', ownerId)
      .in('status', ['not_started', 'in_progress'])
      .order('updated_at', { ascending: false })
      .limit(DASHBOARD_COMMERCE_ACTION_SOURCE_LIMIT)
      .returns<CommerceFulfillmentActionSource[]>(),
    supabase
      .from('checkout_orders')
      .select(CHECKOUT_COMMERCE_SELECT, { count: 'exact' })
      .eq('owner_id', ownerId)
      .eq('status', 'disputed')
      .order('updated_at', { ascending: false })
      .limit(DASHBOARD_COMMERCE_ACTION_SOURCE_LIMIT)
      .returns<CheckoutCommerceSource[]>(),
    supabase
      .from('agent_negotiations')
      .select(NEGOTIATED_ACTION_SELECT, { count: 'exact' })
      .eq('owner_id', ownerId)
      .in('status', NEGOTIATION_ACTION_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(DASHBOARD_COMMERCE_ACTION_SOURCE_LIMIT)
      .returns<NegotiatedCommerceActionSource[]>(),
  ])

  const requests = rows(requestResult)
  const fulfillments = rows(fulfillmentResult)
  const disputedCheckout = rows(disputedCheckoutResult)
  const negotiationCandidates = rows(negotiationCandidateResult)
  const knownCheckoutIds = new Set(disputedCheckout.map((row) => row.id))
  const knownNegotiationIds = new Set(negotiationCandidates.map((row) => row.id))
  const checkoutIds = new Set(fulfillments.map((row) => row.order_id))
  const negotiationIds = new Set<string>()

  for (const request of requests) {
    if (request.order_kind === 'checkout') checkoutIds.add(request.order_id)
    else negotiationIds.add(request.order_id)
  }

  const missingCheckoutIds = [...checkoutIds].filter((id) => !knownCheckoutIds.has(id))
  const missingNegotiationIds = [...negotiationIds].filter((id) => !knownNegotiationIds.has(id))
  const [relatedCheckoutResult, relatedNegotiationResult] = await Promise.all([
    missingCheckoutIds.length
      ? supabase
          .from('checkout_orders')
          .select(CHECKOUT_COMMERCE_SELECT)
          .eq('owner_id', ownerId)
          .in('id', missingCheckoutIds)
          .returns<CheckoutCommerceSource[]>()
      : Promise.resolve({ data: [] as CheckoutCommerceSource[], error: null }),
    missingNegotiationIds.length
      ? supabase
          .from('agent_negotiations')
          .select(NEGOTIATED_ACTION_SELECT)
          .eq('owner_id', ownerId)
          .in('id', missingNegotiationIds)
          .returns<NegotiatedCommerceActionSource[]>()
      : Promise.resolve({ data: [] as NegotiatedCommerceActionSource[], error: null }),
  ])

  const checkoutById = new Map<string, CheckoutCommerceSource>()
  for (const row of [...disputedCheckout, ...rows(relatedCheckoutResult)]) checkoutById.set(row.id, row)
  const negotiationById = new Map<string, NegotiatedCommerceActionSource>()
  for (const row of [...negotiationCandidates, ...rows(relatedNegotiationResult)]) negotiationById.set(row.id, row)
  const fulfillmentByOrder = new Map(fulfillments.map((row) => [row.order_id, row]))
  const requestsByRecord = groupRequests(requests)

  const candidates = [
    ...[...checkoutById.values()].map((row) => checkoutCommerceActionRecord(
      row,
      fulfillmentByOrder.get(row.id) ?? null,
      requestsByRecord.get(`checkout:${row.id}`) ?? [],
    )),
    ...[...negotiationById.values()].map((row) => negotiatedCommerceActionRecord(
      row,
      requestsByRecord.get(`negotiation:${row.id}`) ?? [],
      now,
    )),
  ]
  const actionableCount = candidates.filter(Boolean).length
  const actions = mergeCommerceActionRecords(candidates, DASHBOARD_COMMERCE_ACTION_LIMIT)
  const issues = [
    requestResult.error ? 'Customer requests could not be checked for tasks.' : null,
    fulfillmentResult.error ? 'Order fulfillment could not be checked for tasks.' : null,
    disputedCheckoutResult.error ? 'Payment disputes could not be checked for tasks.' : null,
    negotiationCandidateResult.error ? 'Negotiations could not be checked for tasks.' : null,
    relatedCheckoutResult.error ? 'Orders linked to tasks could not be loaded.' : null,
    relatedNegotiationResult.error ? 'Negotiations linked to customer requests could not be loaded.' : null,
  ].filter((issue): issue is string => Boolean(issue))

  return {
    actions,
    urgentCount: actions.filter((action) => action.urgent).length,
    isTruncated: actionableCount > DASHBOARD_COMMERCE_ACTION_LIMIT
      || [requestResult, fulfillmentResult, disputedCheckoutResult, negotiationCandidateResult].some(wasTruncated),
    issues,
  }
}
