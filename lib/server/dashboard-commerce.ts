import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  mergeCommerceRecords,
  normalizeCheckoutCommerceRecord,
  normalizeNegotiatedCommerceRecord,
  type CheckoutCommerceSource,
  type CheckoutFulfillmentSource,
  type CommerceRail,
  type CommerceRecord,
  type NegotiatedCommerceSource,
} from '../commerce-record'

export const DASHBOARD_COMMERCE_LIMIT = 25

const CHECKOUT_SELECT = [
  'id',
  'offer_name',
  'amount_cents',
  'currency',
  'status',
  'channel',
  'refunded_cents',
  'buyer_email',
  'buyer_name',
  'buyer_reference',
  'buyer_agent',
  'stripe_livemode',
  'created_at',
  'updated_at',
].join(',')

const NEGOTIATED_SELECT = [
  'id',
  'offer_name',
  'amount_cents',
  'currency',
  'status',
  'escrow_mode',
  'refunded_cents',
  'buyer_email',
  'contact',
  'buyer_agent',
  'stripe_payment_intent_id',
  'stripe_livemode',
  'created_at',
  'updated_at',
].join(',')

export type DashboardCommerceFilters = {
  q: string
  rail: CommerceRail | ''
  currency: string
}

export type DashboardCommerceResult = {
  records: CommerceRecord[]
  checkoutCount: number | null
  negotiatedCount: number | null
  total: number
  filters: DashboardCommerceFilters
  issues: string[]
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export function normalizeCommerceSearch(value: string) {
  return value
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function parseDashboardCommerceFilters(
  input: Record<string, string | string[] | undefined>,
): DashboardCommerceFilters {
  const q = normalizeCommerceSearch(first(input.q))
  const requestedRail = first(input.rail).toLowerCase()
  const rail = requestedRail === 'checkout' || requestedRail === 'negotiated' ? requestedRail : ''
  const requestedCurrency = first(input.currency).toLowerCase()
  const currency = /^[a-z]{3}$/.test(requestedCurrency) ? requestedCurrency : ''
  return { q, rail, currency }
}

export async function loadDashboardCommerce(
  supabase: SupabaseClient,
  ownerId: string,
  rawFilters: Record<string, string | string[] | undefined>,
): Promise<DashboardCommerceResult> {
  const filters = parseDashboardCommerceFilters(rawFilters)

  let checkoutQuery = supabase
    .from('checkout_orders')
    .select(CHECKOUT_SELECT, { count: 'exact' })
    .eq('owner_id', ownerId)
  let negotiatedQuery = supabase
    .from('agent_negotiations')
    .select(NEGOTIATED_SELECT, { count: 'exact' })
    .eq('owner_id', ownerId)

  if (filters.q) {
    const match = `%${filters.q}%`
    checkoutQuery = checkoutQuery.or([
      `offer_name.ilike.${match}`,
      `buyer_name.ilike.${match}`,
      `buyer_email.ilike.${match}`,
      `buyer_reference.ilike.${match}`,
      `buyer_agent.ilike.${match}`,
    ].join(','))
    negotiatedQuery = negotiatedQuery.or([
      `offer_name.ilike.${match}`,
      `buyer_email.ilike.${match}`,
      `contact.ilike.${match}`,
      `buyer_agent.ilike.${match}`,
    ].join(','))
  }
  if (filters.currency) {
    checkoutQuery = checkoutQuery.eq('currency', filters.currency)
    negotiatedQuery = negotiatedQuery.eq('currency', filters.currency)
  }

  const checkoutPromise = filters.rail === 'negotiated'
    ? Promise.resolve({ data: [] as CheckoutCommerceSource[], error: null, count: 0 })
    : checkoutQuery
        .order('updated_at', { ascending: false })
        .limit(DASHBOARD_COMMERCE_LIMIT)
        .returns<CheckoutCommerceSource[]>()
  const negotiatedPromise = filters.rail === 'checkout'
    ? Promise.resolve({ data: [] as NegotiatedCommerceSource[], error: null, count: 0 })
    : negotiatedQuery
        .order('updated_at', { ascending: false })
        .limit(DASHBOARD_COMMERCE_LIMIT)
        .returns<NegotiatedCommerceSource[]>()

  const [checkoutResult, negotiatedResult] = await Promise.all([checkoutPromise, negotiatedPromise])
  const checkoutRows = checkoutResult.error ? [] : checkoutResult.data ?? []
  const negotiatedRows = negotiatedResult.error ? [] : negotiatedResult.data ?? []

  const fulfillmentResult = checkoutRows.length
    ? await supabase
        .from('checkout_order_fulfillments')
        .select('order_id, status')
        .eq('owner_id', ownerId)
        .in('order_id', checkoutRows.map((row) => row.id))
        .returns<CheckoutFulfillmentSource[]>()
    : { data: [] as CheckoutFulfillmentSource[], error: null }
  const fulfillmentByOrder = new Map(
    (fulfillmentResult.error ? [] : fulfillmentResult.data ?? []).map((row) => [row.order_id, row]),
  )

  const checkoutRecords = checkoutRows.map((row) =>
    normalizeCheckoutCommerceRecord(row, fulfillmentByOrder.get(row.id) ?? null),
  )
  const negotiatedRecords = negotiatedRows.map(normalizeNegotiatedCommerceRecord)
  const checkoutCount = filters.rail === 'negotiated' || checkoutResult.error
    ? null
    : checkoutResult.count ?? checkoutRows.length
  const negotiatedCount = filters.rail === 'checkout' || negotiatedResult.error
    ? null
    : negotiatedResult.count ?? negotiatedRows.length
  const issues = [
    checkoutResult.error ? 'Checkout orders could not be loaded.' : null,
    negotiatedResult.error ? 'Negotiated commerce could not be loaded.' : null,
    fulfillmentResult.error ? 'Checkout fulfillment states could not be loaded.' : null,
  ].filter((issue): issue is string => Boolean(issue))

  return {
    records: mergeCommerceRecords(checkoutRecords, negotiatedRecords, DASHBOARD_COMMERCE_LIMIT),
    checkoutCount,
    negotiatedCount,
    total: (checkoutCount ?? 0) + (negotiatedCount ?? 0),
    filters,
    issues,
  }
}
