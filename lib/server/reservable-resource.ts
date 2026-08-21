import 'server-only'
import { actionRequestHash } from '../action-approval'
import type { ReservableResourceTerms } from '../reservable-resource'
import {
  resolveResourceAllocations,
  resourceAllocationRpcPayload,
  resourceApprovalPayload,
  type ResolvedResourceAllocation,
  type ResourcePoolAuthority,
  type ResourceWindowAuthority,
} from '../reservable-resource-runtime'

export const STRIPE_RESERVABLE_RESOURCE_KIND = 'reservable_resource' as const

type AdminClient = {
  from: (table: string) => any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>
}

type PoolRow = {
  id: string
  owner_id: string
  page_id: string
  resource_key: string
  label: string
  unit_label: string
  kind: 'consumable' | 'reusable'
  total_quantity: number
  status: 'active' | 'paused' | 'retired'
  version: number
}

type WindowRow = {
  id: string
  pool_id: string
  window_key: string
  label: string
  starts_at: string
  ends_at: string
  total_quantity: number
  status: 'active' | 'paused' | 'retired'
  version: number
}

type HoldRow = {
  id: string
  status: string
  expires_at: string
  transaction_fingerprint: string
  allocation_fingerprint: string
  stripe_checkout_session_id: string | null
  stripe_connect_account_id: string | null
}

export type AcquiredResourceHold = {
  holdId: string
  status: 'held'
  expiresAt: string
  allocationFingerprint: string
  allocations: ResolvedResourceAllocation[]
}

function poolAuthority(row: PoolRow): ResourcePoolAuthority {
  return {
    id: row.id,
    ownerId: row.owner_id,
    pageId: row.page_id,
    key: row.resource_key,
    label: row.label,
    unitLabel: row.unit_label,
    kind: row.kind,
    totalQuantity: row.total_quantity,
    status: row.status,
    version: row.version,
  }
}

function windowAuthority(row: WindowRow): ResourceWindowAuthority {
  return {
    id: row.id,
    poolId: row.pool_id,
    key: row.window_key,
    label: row.label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    totalQuantity: row.total_quantity,
    status: row.status,
    version: row.version,
  }
}

export function resourceAllocationFingerprint(allocations: readonly ResolvedResourceAllocation[]) {
  return actionRequestHash('checkout', { resourceAllocations: resourceAllocationRpcPayload(allocations) })
}

export function resourceBuyerScopeHash(input: {
  pageId: string
  offerKey: string
  buyerEmail?: string | null
  buyerReference?: string | null
  buyerAgent?: string | null
  remoteAddress?: string | null
}) {
  return actionRequestHash('checkout', {
    resourceBuyerScope: {
      pageId: input.pageId,
      offerKey: input.offerKey,
      buyerEmail: input.buyerEmail?.trim().toLowerCase() || null,
      buyerReference: input.buyerReference?.trim() || null,
      buyerAgent: input.buyerAgent?.trim() || null,
      remoteAddress: input.remoteAddress?.trim() || null,
    },
  })
}

export async function resolveAuthoritativeResources(input: {
  admin: AdminClient
  ownerId: string
  pageId: string
  terms: ReservableResourceTerms
  configuration: Readonly<Record<string, unknown>>
  nowMs?: number
}) {
  const poolIds = input.terms.requirements.map((requirement) => requirement.poolId)
  const windowIds = input.terms.requirements
    .map((requirement) => requirement.windowId)
    .filter((id): id is string => Boolean(id))
  const [poolResult, windowResult] = await Promise.all([
    input.admin
      .from('resource_pools')
      .select('id, owner_id, page_id, resource_key, label, unit_label, kind, total_quantity, status, version')
      .in('id', poolIds),
    windowIds.length
      ? input.admin
        .from('resource_pool_windows')
        .select('id, pool_id, window_key, label, starts_at, ends_at, total_quantity, status, version')
        .in('id', windowIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (poolResult.error || windowResult.error) {
    return { ok: false as const, code: 'resource_authority_unavailable', error: 'Merchant resource authority could not be loaded.' }
  }
  return resolveResourceAllocations({
    terms: input.terms,
    configuration: input.configuration,
    pools: ((poolResult.data ?? []) as PoolRow[]).map(poolAuthority),
    windows: ((windowResult.data ?? []) as WindowRow[]).map(windowAuthority),
    ownerId: input.ownerId,
    pageId: input.pageId,
    nowMs: input.nowMs,
  })
}

export async function acquireAuthoritativeResourceHold(input: {
  admin: AdminClient
  ownerId: string
  pageId: string
  offerKey: string
  buyerScopeHash: string
  requestIdempotencyKey: string
  transactionFingerprint: string
  allocations: readonly ResolvedResourceAllocation[]
  ttlSeconds?: number
}): Promise<
  | { ok: true; hold: AcquiredResourceHold; approval: ReturnType<typeof resourceApprovalPayload> }
  | { ok: false; code: string; error: string }
> {
  const allocationFingerprint = resourceAllocationFingerprint(input.allocations)
  const { data: holdId, error } = await input.admin.rpc('acquire_resource_hold', {
    p_owner_id: input.ownerId,
    p_page_id: input.pageId,
    p_offer_key: input.offerKey,
    p_buyer_scope_hash: input.buyerScopeHash,
    p_request_idempotency_key: input.requestIdempotencyKey,
    p_transaction_fingerprint: input.transactionFingerprint,
    p_allocation_fingerprint: allocationFingerprint,
    p_allocations: resourceAllocationRpcPayload(input.allocations),
    p_hold_ttl_seconds: input.ttlSeconds ?? 1_800,
  })
  if (error || typeof holdId !== 'string') {
    const message = String(error?.message ?? '')
    const unavailable = message.includes('unavailable') || message.includes('maximum active holds')
    return {
      ok: false,
      code: unavailable ? 'resources_unavailable' : message.includes('idempotency') ? 'resource_idempotency_conflict' : 'resource_hold_failed',
      error: unavailable
        ? 'The exact requested resource quantity is not currently holdable.'
        : 'Could not acquire the merchant resource hold.',
    }
  }
  const { data: rawRow, error: readError } = await input.admin
    .from('resource_holds')
    .select('id, status, expires_at, transaction_fingerprint, allocation_fingerprint, stripe_checkout_session_id, stripe_connect_account_id')
    .eq('id', holdId)
    .maybeSingle()
  const row = rawRow as HoldRow | null
  if (
    readError
    || !row
    || row.status !== 'active'
    || row.transaction_fingerprint !== input.transactionFingerprint
    || row.allocation_fingerprint !== allocationFingerprint
    || Date.parse(row.expires_at) <= Date.now()
  ) {
    return { ok: false, code: 'resource_hold_unavailable', error: 'The resource hold is no longer active. Start a new validation.' }
  }
  const hold: AcquiredResourceHold = {
    holdId: row.id,
    status: 'held',
    expiresAt: row.expires_at,
    allocationFingerprint,
    allocations: input.allocations.map((allocation) => ({ ...allocation })),
  }
  return {
    ok: true,
    hold,
    approval: resourceApprovalPayload({
      holdId: hold.holdId,
      expiresAt: hold.expiresAt,
      allocationFingerprint,
      allocations: hold.allocations,
    }),
  }
}

export async function attachResourceHoldPayment(input: {
  admin: AdminClient
  holdId: string
  transactionFingerprint: string
  allocationFingerprint: string
  stripeCheckoutSessionId: string
  stripeConnectAccountId: string
  amountCents: number
  currency: string
}) {
  const { data, error } = await input.admin.rpc('attach_resource_hold_payment', {
    p_hold_id: input.holdId,
    p_transaction_fingerprint: input.transactionFingerprint,
    p_allocation_fingerprint: input.allocationFingerprint,
    p_stripe_checkout_session_id: input.stripeCheckoutSessionId,
    p_stripe_connect_account_id: input.stripeConnectAccountId,
    p_amount_cents: input.amountCents,
    p_currency: input.currency,
  })
  return error || typeof data !== 'string'
    ? { ok: false as const, error: error?.message ?? 'Could not attach resource hold to payment.' }
    : { ok: true as const, expiresAt: data }
}

export async function releaseResourceHold(input: {
  admin: AdminClient
  holdId: string
  reason: string
  stripeCheckoutSessionId?: string | null
}) {
  const { data, error } = await input.admin.rpc('release_resource_hold', {
    p_hold_id: input.holdId,
    p_reason: input.reason,
    p_stripe_checkout_session_id: input.stripeCheckoutSessionId ?? null,
  })
  return error
    ? { ok: false as const, error: error.message }
    : { ok: true as const, status: String(data) }
}

export async function commitResourceHold(input: {
  admin: AdminClient
  holdId: string
  transactionFingerprint: string
  allocationFingerprint: string
  stripeCheckoutSessionId: string
  stripeConnectAccountId: string
  stripePaymentIntentId: string
  paymentEventId: string
}) {
  const { data, error } = await input.admin.rpc('commit_resource_hold', {
    p_hold_id: input.holdId,
    p_transaction_fingerprint: input.transactionFingerprint,
    p_allocation_fingerprint: input.allocationFingerprint,
    p_stripe_checkout_session_id: input.stripeCheckoutSessionId,
    p_stripe_connect_account_id: input.stripeConnectAccountId,
    p_stripe_payment_intent_id: input.stripePaymentIntentId,
    p_payment_event_id: input.paymentEventId,
  })
  return error || typeof data !== 'string'
    ? { ok: false as const, error: error?.message ?? 'Could not commit resource reservation.' }
    : { ok: true as const, reservationId: data }
}

export async function linkResourceReservationOrder(input: {
  admin: AdminClient
  holdId: string
  checkoutOrderId: string
}) {
  const { data, error } = await input.admin.rpc('link_resource_reservation_order', {
    p_hold_id: input.holdId,
    p_checkout_order_id: input.checkoutOrderId,
  })
  return !error && data === true
}

export function reservableResourceStripeMetadata(input: {
  holdId: string
  transactionFingerprint: string
  allocationFingerprint: string
  ownerId: string
  pageId: string
  offerKey: string
}) {
  return {
    nexez_kind: STRIPE_RESERVABLE_RESOURCE_KIND,
    nexez_resource_hold_id: input.holdId,
    nexez_resource_transaction_fingerprint: input.transactionFingerprint,
    nexez_resource_allocation_fingerprint: input.allocationFingerprint,
    nexez_owner_id: input.ownerId,
    nexez_page_id: input.pageId,
    nexez_offer_key: input.offerKey,
  }
}
