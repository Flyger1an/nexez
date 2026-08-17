import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CheckoutSession,
  SessionApproval,
  SessionBuyer,
  SessionLineItem,
  SessionStatus,
  SessionTotals,
} from '../commerce/checkout-session-core'

// Persistence seam for ACP/UCP checkout sessions (SF3). The pure core is stateless -
// createSession/updateSession take a caller-supplied id and a prior CheckoutSession -
// so the DB row IS the snapshot the route rehydrates between the protocols' id-only
// create->update->complete calls. This module maps CheckoutSession <-> the
// service-role-only `checkout_sessions` row and wraps the service-role CRUD.
//
// The mappers are pure + unit-tested; the CRUD takes an admin (service-role) client
// because `checkout_sessions` is RLS-on/no-policy + grants revoked from browser roles.

export type SessionChannel = 'acp' | 'ucp'

/** A `checkout_sessions` row (jsonb columns typed as the core's resolved shapes). */
export type CheckoutSessionRow = {
  id: string
  channel: SessionChannel
  page_id: string
  slug: string
  owner_id: string | null
  /** DB status includes 'expired' (a GC/expiry state the pure core has no concept of). */
  status: SessionStatus | 'expired'
  currency: string
  line_items: SessionLineItem[]
  buyer: SessionBuyer | null
  totals: SessionTotals
  /** What the buyer authorized, frozen at the first `ready`. Null only for rows
   * created before these columns existed. Never overwritten once set, except by a
   * deliberate cart replacement (see `updateSession`). */
  approved_amount_cents: number | null
  approved_currency: string | null
  approved_cart_fingerprint: string | null
  idempotency_key: string | null
  stripe_payment_intent_id: string | null
  stripe_livemode: boolean | null
  api_version: string | null
  expires_at: string
  created_at?: string
  updated_at?: string
}

export type PersistSessionMeta = {
  channel: SessionChannel
  pageId: string
  ownerId: string | null
  idempotencyKey?: string | null
  apiVersion?: string | null
  /** ISO timestamp; use defaultSessionExpiry() unless a protocol token caps it sooner. */
  expiresAt: string
  stripePaymentIntentId?: string | null
  stripeLivemode?: boolean | null
}

// ---------------------------------------------------------------------------
// Pure mappers (unit-tested)
// ---------------------------------------------------------------------------

/** CheckoutSession + metadata -> the row values to INSERT. */
export function sessionInsertValues(session: CheckoutSession, meta: PersistSessionMeta) {
  return {
    id: session.id,
    channel: meta.channel,
    page_id: meta.pageId,
    slug: session.source.slug,
    owner_id: meta.ownerId,
    status: session.status,
    currency: session.currency,
    line_items: session.lineItems,
    buyer: session.buyer,
    totals: session.totals,
    ...approvalColumns(session.approval),
    idempotency_key: meta.idempotencyKey ?? null,
    stripe_payment_intent_id: meta.stripePaymentIntentId ?? null,
    stripe_livemode: meta.stripeLivemode ?? null,
    api_version: meta.apiVersion ?? null,
    expires_at: meta.expiresAt,
  }
}

/** The mutable snapshot to write on an update/complete. Never touches id/channel/
 * page_id/expiry - those are create-time immutable.
 *
 * The approval columns are written as a faithful projection of the session, nulls
 * included. Immutability is the CORE's invariant (`updateSession` carries an existing
 * approval through a re-price and only discards it on a deliberate cart replacement),
 * so a mapper that refused to write null would strand a stale authorization on a
 * re-carted session and refuse it at settlement. */
export function sessionUpdateValues(
  session: CheckoutSession,
  extra?: { stripePaymentIntentId?: string | null; stripeLivemode?: boolean | null },
) {
  return {
    status: session.status,
    currency: session.currency,
    line_items: session.lineItems,
    buyer: session.buyer,
    totals: session.totals,
    ...approvalColumns(session.approval),
    ...(extra?.stripePaymentIntentId ? { stripe_payment_intent_id: extra.stripePaymentIntentId } : {}),
    ...(typeof extra?.stripeLivemode === 'boolean' ? { stripe_livemode: extra.stripeLivemode } : {}),
  }
}

/** Rehydrate a row into a CheckoutSession the pure core can update/settle. `pageName`
 * comes from the fresh page load the route does to re-price (it is not persisted).
 * `issues` is transient (recomputed on re-price) so it rehydrates empty. A DB-only
 * 'expired' status maps to the terminal 'canceled' so the core treats it as unpayable. */
export function rowToSession(row: CheckoutSessionRow, pageName: string): CheckoutSession {
  return {
    id: row.id,
    status: row.status === 'expired' ? 'canceled' : row.status,
    currency: row.currency,
    lineItems: row.line_items ?? [],
    issues: [],
    totals: row.totals,
    buyer: row.buyer ?? null,
    approval: rowApproval(row),
    source: { slug: row.slug, pageName },
  }
}

/** SessionApproval -> the three row columns. Split out so insert and update write an
 * identical projection. */
function approvalColumns(approval: SessionApproval | null) {
  return {
    approved_amount_cents: approval?.amount ?? null,
    approved_currency: approval?.currency ?? null,
    approved_cart_fingerprint: approval?.cartFingerprint ?? null,
  }
}

/** The three row columns -> SessionApproval. All-or-nothing: a partially written row
 * (only possible via hand-editing) rehydrates as no approval rather than as a
 * half-specified one that would compare against garbage. */
function rowApproval(row: CheckoutSessionRow): SessionApproval | null {
  if (
    typeof row.approved_amount_cents !== 'number' ||
    typeof row.approved_currency !== 'string' ||
    typeof row.approved_cart_fingerprint !== 'string'
  ) {
    return null
  }
  return {
    amount: row.approved_amount_cents,
    currency: row.approved_currency,
    cartFingerprint: row.approved_cart_fingerprint,
  }
}

/** Default session lifetime. A checkout session is a short-lived price quote; an
 * adapter may pass a sooner expiry when a delegated token expires first. */
export function defaultSessionExpiry(nowMs: number = Date.now(), minutes = 45): string {
  return new Date(nowMs + minutes * 60_000).toISOString()
}

/** True when the row's quote has lapsed - never settle a stale quote whose live
 * price/availability may have drifted. */
export function isSessionExpired(row: Pick<CheckoutSessionRow, 'expires_at'>, nowMs: number = Date.now()): boolean {
  const expiry = new Date(row.expires_at).getTime()
  return !Number.isFinite(expiry) || expiry <= nowMs
}

// ---------------------------------------------------------------------------
// Service-role CRUD
// ---------------------------------------------------------------------------

type Admin = Pick<SupabaseClient, 'from'>

/** Insert a new session snapshot. Returns the row (with DB-minted id if not supplied)
 * or null on error. */
export async function persistSession(
  admin: Admin,
  session: CheckoutSession,
  meta: PersistSessionMeta,
): Promise<CheckoutSessionRow | null> {
  const { data, error } = await admin
    .from('checkout_sessions')
    .insert(sessionInsertValues(session, meta))
    .select('*')
    .single<CheckoutSessionRow>()
  if (error) {
    console.warn('[checkout_sessions] insert failed:', error.message)
    return null
  }
  return data
}

/** Load a session row by id (service-role read). */
export async function loadSessionRow(admin: Admin, id: string): Promise<CheckoutSessionRow | null> {
  const { data } = await admin
    .from('checkout_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle<CheckoutSessionRow>()
  return data ?? null
}

/** Write the mutable snapshot back after an update/complete. */
export async function updateSessionSnapshot(
  admin: Admin,
  id: string,
  session: CheckoutSession,
  extra?: { stripePaymentIntentId?: string | null; stripeLivemode?: boolean | null },
): Promise<boolean> {
  const { error } = await admin
    .from('checkout_sessions')
    .update(sessionUpdateValues(session, extra))
    .eq('id', id)
  return !error
}

/** Create-time idempotency lookup: the original session for a replayed create. */
export async function findSessionByIdempotencyKey(
  admin: Admin,
  channel: SessionChannel,
  idempotencyKey: string,
): Promise<CheckoutSessionRow | null> {
  const { data } = await admin
    .from('checkout_sessions')
    .select('*')
    .eq('channel', channel)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<CheckoutSessionRow>()
  return data ?? null
}

/** Flag a lapsed session terminal so a later update/complete can't settle it. */
export async function markSessionExpired(admin: Admin, id: string): Promise<boolean> {
  const { error } = await admin.from('checkout_sessions').update({ status: 'expired' }).eq('id', id)
  return !error
}
