import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { minorToStripeAmount } from '../currency'
import type { BuyerOrderRequest, BuyerOrderView, BuyerRequestKind } from '../buyer-portal'

// Server-side resolver for the buyer order portal. The buyer's token IS the
// authorization (mirrors loadNegotiation): checkout_orders/agent_negotiations are
// owner-RLS'd, so we read them with the SERVICE-ROLE client and gate on the
// unguessable token, returning only buyer-safe fields (no owner_id, no offer rules,
// no internal notes). Without admin env (local/tests) there's nothing to read → null.

// agent_negotiations.contact is free-form agent-supplied text — only ever treat it
// as an email recipient when it actually looks like an address (else we'd email an
// arbitrary third party / store junk as the buyer's identity). Exported for testing.
export function emailish(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null
}

// agent_negotiations.amount_cents is stored in 2-decimal MINOR units (always major×100,
// even for zero-decimal currencies); checkout_orders.amount_cents is already Stripe's
// smallest unit. Normalize negotiation amounts to the smallest unit so downstream
// formatCurrencyAmount renders JPY/KRW correctly (mirrors the webhook settle math).
export function negotiationDisplayCents(amountCents: number | null, currency: string): number | null {
  return amountCents == null ? null : minorToStripeAmount(amountCents, currency)
}

// An order/deal that's still on a "funds-collected" status (checkout 'paid' or a
// settled negotiation 'complete') but carries a recorded out-of-band partial refund
// should read as partially refunded for the buyer — the webhook keeps the base status
// so the seller can refund the remainder, but the buyer was already emailed about it.
// Applied to BOTH read paths + both money kinds so the portal display, the refund
// eligibility, and the seller email all agree.
export function deriveOrderStatus(status: string, metadata: Record<string, unknown> | null): string {
  if ((status === 'paid' || status === 'complete') && metadata && (metadata as { partial_refund?: unknown }).partial_refund) {
    return 'partial_refund'
  }
  return status
}

type SellerInfo = { name: string | null; contact_email: string | null }

async function loadSeller(admin: ReturnType<typeof createAdminClient>, slug: string | null): Promise<SellerInfo> {
  if (!slug) return { name: null, contact_email: null }
  // pages_public strips offer `rules` and is safe to read for the seller's display
  // name + public contact email. A now-unpublished page simply resolves to null.
  const { data } = await admin
    .from('pages_public')
    .select('name, contact_email')
    .eq('slug', slug)
    .maybeSingle<SellerInfo>()
  return { name: data?.name ?? null, contact_email: data?.contact_email ?? null }
}

async function loadRequests(
  admin: ReturnType<typeof createAdminClient>,
  orderKind: 'checkout' | 'negotiation',
  orderId: string,
): Promise<BuyerOrderRequest[]> {
  const { data } = await admin
    .from('order_requests')
    .select('id, kind, status, message, created_at')
    .eq('order_kind', orderKind)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .returns<{ id: string; kind: BuyerRequestKind; status: string; message: string | null; created_at: string }[]>()
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    message: r.message,
    createdAt: r.created_at,
  }))
}

type CheckoutRow = {
  id: string
  slug: string | null
  page_id: string | null
  offer_name: string | null
  amount_cents: number
  currency: string
  status: string
  buyer_email: string | null
  stripe_session_id: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type NegotiationRow = {
  id: string
  slug: string | null
  page_id: string | null
  offer_name: string | null
  amount_cents: number | null
  currency: string
  status: string
  settlement_state: string | null
  buyer_email: string | null
  contact: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Resolve a portal token to a buyer-safe order/negotiation view, or null. */
export async function loadOrderByToken(token: string): Promise<BuyerOrderView | null> {
  const clean = (token || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return null
  const admin = createAdminClient()

  // 1. Direct checkout order (its own access_token).
  const { data: order } = await admin
    .from('checkout_orders')
    .select('id, slug, page_id, offer_name, amount_cents, currency, status, buyer_email, stripe_session_id, metadata, created_at')
    .eq('access_token', clean)
    .maybeSingle<CheckoutRow>()
  if (order) {
    const [seller, requests] = await Promise.all([loadSeller(admin, order.slug), loadRequests(admin, 'checkout', order.id)])
    return {
      kind: 'checkout',
      token: clean,
      reference: order.stripe_session_id,
      offerName: order.offer_name,
      amountCents: order.amount_cents,
      currency: order.currency || 'usd',
      status: deriveOrderStatus(order.status, order.metadata),
      sellerName: seller.name,
      sellerEmail: seller.contact_email,
      buyerEmail: order.buyer_email,
      slug: order.slug,
      createdAt: order.created_at,
      requests,
    }
  }

  // 2. Negotiation buyer (reuses the existing status_token credential).
  const { data: neg } = await admin
    .from('agent_negotiations')
    .select('id, slug, page_id, offer_name, amount_cents, currency, status, settlement_state, buyer_email, contact, metadata, created_at')
    .eq('status_token', clean)
    .maybeSingle<NegotiationRow>()
  if (neg) {
    const [seller, requests] = await Promise.all([loadSeller(admin, neg.slug), loadRequests(admin, 'negotiation', neg.id)])
    return {
      kind: 'negotiation',
      token: clean,
      reference: neg.id,
      offerName: neg.offer_name,
      amountCents: negotiationDisplayCents(neg.amount_cents, neg.currency || 'usd'),
      currency: neg.currency || 'usd',
      status: deriveOrderStatus(neg.status, neg.metadata),
      settlementState: neg.settlement_state,
      sellerName: seller.name,
      sellerEmail: seller.contact_email,
      // `contact` is the agent-supplied buyer contact; buyer_email (captured at
      // funding) is the verified one. Only fall back to contact if it's email-shaped.
      buyerEmail: neg.buyer_email || emailish(neg.contact),
      slug: neg.slug,
      createdAt: neg.created_at,
      requests,
    }
  }

  return null
}

// Internal (NOT buyer-safe) resolution for the recourse API — it needs owner_id +
// page_id to write the order_requests row and notify the seller. Never returned to a
// client; the route uses it server-side only.
export type OrderRequestTarget = {
  kind: 'checkout' | 'negotiation'
  orderId: string
  ownerId: string | null
  pageId: string | null
  slug: string | null
  offerName: string | null
  amountCents: number | null
  currency: string
  status: string
  buyerEmail: string | null
  sellerName: string | null
  sellerEmail: string | null
  // Kinds with a live (open/acknowledged) request — block a duplicate.
  openRequestKinds: string[]
  // Lifetime count per kind (ALL statuses) — caps post-closure re-filing / spam.
  requestTotals: Record<string, number>
}

async function pageOwnerId(admin: ReturnType<typeof createAdminClient>, pageId: string | null): Promise<string | null> {
  if (!pageId) return null
  const { data } = await admin.from('pages').select('owner_id').eq('id', pageId).maybeSingle<{ owner_id: string | null }>()
  return data?.owner_id ?? null
}

type RequestStats = { openRequestKinds: string[]; requestTotals: Record<string, number> }

async function requestStats(
  admin: ReturnType<typeof createAdminClient>,
  orderKind: 'checkout' | 'negotiation',
  orderId: string,
): Promise<RequestStats> {
  const { data } = await admin
    .from('order_requests')
    .select('kind, status')
    .eq('order_kind', orderKind)
    .eq('order_id', orderId)
    .returns<{ kind: string; status: string }[]>()
  const rows = data ?? []
  const openRequestKinds = rows.filter((r) => r.status === 'open' || r.status === 'acknowledged').map((r) => r.kind)
  const requestTotals: Record<string, number> = {}
  for (const r of rows) requestTotals[r.kind] = (requestTotals[r.kind] || 0) + 1
  return { openRequestKinds, requestTotals }
}

export async function resolveOrderForRequest(token: string): Promise<OrderRequestTarget | null> {
  const clean = (token || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return null
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('checkout_orders')
    .select('id, owner_id, page_id, slug, offer_name, amount_cents, currency, status, buyer_email, metadata')
    .eq('access_token', clean)
    .maybeSingle<{
      id: string
      owner_id: string | null
      page_id: string | null
      slug: string | null
      offer_name: string | null
      amount_cents: number
      currency: string
      status: string
      buyer_email: string | null
      metadata: Record<string, unknown> | null
    }>()
  if (order) {
    const [seller, stats] = await Promise.all([loadSeller(admin, order.slug), requestStats(admin, 'checkout', order.id)])
    return {
      kind: 'checkout',
      orderId: order.id,
      ownerId: order.owner_id ?? (await pageOwnerId(admin, order.page_id)),
      pageId: order.page_id,
      slug: order.slug,
      offerName: order.offer_name,
      amountCents: order.amount_cents,
      currency: order.currency || 'usd',
      status: deriveOrderStatus(order.status, order.metadata),
      buyerEmail: order.buyer_email,
      sellerName: seller.name,
      sellerEmail: seller.contact_email,
      openRequestKinds: stats.openRequestKinds,
      requestTotals: stats.requestTotals,
    }
  }

  const { data: neg } = await admin
    .from('agent_negotiations')
    .select('id, owner_id, page_id, slug, offer_name, amount_cents, currency, status, buyer_email, contact, metadata')
    .eq('status_token', clean)
    .maybeSingle<{
      id: string
      owner_id: string | null
      page_id: string | null
      slug: string | null
      offer_name: string | null
      amount_cents: number | null
      currency: string
      status: string
      buyer_email: string | null
      contact: string | null
      metadata: Record<string, unknown> | null
    }>()
  if (neg) {
    const [seller, stats] = await Promise.all([loadSeller(admin, neg.slug), requestStats(admin, 'negotiation', neg.id)])
    return {
      kind: 'negotiation',
      orderId: neg.id,
      ownerId: neg.owner_id ?? (await pageOwnerId(admin, neg.page_id)),
      pageId: neg.page_id,
      slug: neg.slug,
      offerName: neg.offer_name,
      amountCents: negotiationDisplayCents(neg.amount_cents, neg.currency || 'usd'),
      currency: neg.currency || 'usd',
      status: deriveOrderStatus(neg.status, neg.metadata),
      buyerEmail: neg.buyer_email || emailish(neg.contact),
      sellerName: seller.name,
      sellerEmail: seller.contact_email,
      openRequestKinds: stats.openRequestKinds,
      requestTotals: stats.requestTotals,
    }
  }

  return null
}

type SessionLookup = { token: string; status: string } | null

/** Map a Stripe session id (which the buyer always has from the success URL) to its
 *  order's portal token — so the success page can link straight into the portal
 *  once the webhook has captured the order (the capture is async; null until then). */
export async function loadOrderTokenBySession(sessionId: string): Promise<SessionLookup> {
  const clean = (sessionId || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return null
  const { data } = await createAdminClient()
    .from('checkout_orders')
    .select('access_token, status')
    .eq('stripe_session_id', clean)
    .maybeSingle<{ access_token: string | null; status: string }>()
  if (!data?.access_token) return null
  return { token: data.access_token, status: data.status }
}

// Batch-resolve seller display names for a set of slugs (one query, not N).
async function loadSellerNames(admin: ReturnType<typeof createAdminClient>, slugs: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(slugs.filter(Boolean))]
  if (!unique.length) return new Map()
  const { data } = await admin
    .from('pages_public')
    .select('slug, name')
    .in('slug', unique)
    .returns<{ slug: string; name: string | null }[]>()
  return new Map((data ?? []).filter((r) => r.name).map((r) => [r.slug, r.name as string]))
}

const FIND_ORDERS_CAP = 50

/** Find ALL orders/negotiations for a buyer email (the "find my orders" magic link).
 *  Email match is case-insensitive. Returns lightweight summaries, newest first, each
 *  carrying its own per-order token so the row links into the full portal view. The
 *  email is the authorization (the caller verified a signed token over it). */
export async function findOrdersByEmail(email: string): Promise<import('../buyer-portal').BuyerOrderSummary[]> {
  const clean = (email || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()

  // Case-insensitive EXACT match. Escape the LIKE metacharacters so a buyer email can
  // never wildcard-match another buyer's address. NB: besides SQL's % and _, PostgREST
  // additionally aliases `*` to `%` in its ilike operator (URL-level, before SQL), and
  // both _ and * pass the route's email regex — so * MUST be escaped too.
  const pattern = clean.replace(/([\\%_*])/g, '\\$1')

  const [orders, negs] = await Promise.all([
    admin
      .from('checkout_orders')
      .select('access_token, slug, offer_name, amount_cents, currency, status, metadata, created_at')
      .ilike('buyer_email', pattern)
      .order('created_at', { ascending: false })
      .limit(FIND_ORDERS_CAP)
      .returns<{ access_token: string | null; slug: string | null; offer_name: string | null; amount_cents: number; currency: string; status: string; metadata: Record<string, unknown> | null; created_at: string }[]>(),
    admin
      .from('agent_negotiations')
      .select('status_token, slug, offer_name, amount_cents, currency, status, metadata, created_at')
      .ilike('buyer_email', pattern)
      .order('created_at', { ascending: false })
      .limit(FIND_ORDERS_CAP)
      .returns<{ status_token: string | null; slug: string | null; offer_name: string | null; amount_cents: number | null; currency: string; status: string; metadata: Record<string, unknown> | null; created_at: string }[]>(),
  ])

  const orderRows = (orders.data ?? []).filter((r) => r.access_token)
  const negRows = (negs.data ?? []).filter((r) => r.status_token)
  const sellers = await loadSellerNames(admin, [...orderRows.map((r) => r.slug ?? ''), ...negRows.map((r) => r.slug ?? '')])

  const summaries: import('../buyer-portal').BuyerOrderSummary[] = [
    ...orderRows.map((r) => ({
      kind: 'checkout' as const,
      token: r.access_token as string,
      offerName: r.offer_name,
      amountCents: r.amount_cents,
      currency: r.currency || 'usd',
      status: deriveOrderStatus(r.status, r.metadata),
      sellerName: r.slug ? sellers.get(r.slug) ?? null : null,
      slug: r.slug,
      createdAt: r.created_at,
    })),
    ...negRows.map((r) => ({
      kind: 'negotiation' as const,
      token: r.status_token as string,
      offerName: r.offer_name,
      amountCents: negotiationDisplayCents(r.amount_cents, r.currency || 'usd'),
      currency: r.currency || 'usd',
      status: deriveOrderStatus(r.status, r.metadata),
      sellerName: r.slug ? sellers.get(r.slug) ?? null : null,
      slug: r.slug,
      createdAt: r.created_at,
    })),
  ]

  return summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, FIND_ORDERS_CAP)
}
