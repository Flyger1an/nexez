import { withRefundIntent } from './refund-intent'
import { config } from './config'
import { supabase } from './supabase'
import type { SimulationResult } from '@/src/types/nexez'
import type {
  IntakeCommitResponse,
  IntakeGapAnswer,
  IntakeSessionState,
  IntakeSessionSummary,
  IntakeTurnResponse,
} from '@/src/types/intake'
import type { OwnerNegotiationDecision } from '../../../../lib/contracts/negotiation-types'
import { MOBILE_PLATFORM_API_PATHS, mobilePlatformApiPath } from './platform-contract-snapshot'

type ApiOptions = RequestInit & {
  auth?: boolean
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('content-type', headers.get('content-type') ?? 'application/json')

  if (options.auth !== false) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) headers.set('authorization', `Bearer ${session.access_token}`)
  }

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`
    throw new Error(message)
  }

  return payload as T
}

export function runSimulation(input: { slug: string; query: string }) {
  return apiFetch<SimulationResult>(MOBILE_PLATFORM_API_PATHS.simulateLlm, {
    auth: false,
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function runDemoSimulation(query: string) {
  return apiFetch<SimulationResult>(MOBILE_PLATFORM_API_PATHS.publicSimulate, {
    auth: false,
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export function webPath(path: string) {
  return `${config.apiUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export type SellerNotificationPreferences = {
  transactions: true
  negotiations: boolean
  integrations: boolean
  reviews: boolean
  marketing: boolean
}

export type SellerNotificationPreferencesResponse = {
  ok: boolean
  configured: boolean
  preferences: SellerNotificationPreferences
}

export type SellerNotificationPreferencePatch = Partial<
  Pick<SellerNotificationPreferences, 'negotiations' | 'integrations' | 'reviews' | 'marketing'>
>

export function getSellerNotificationPreferences() {
  return apiFetch<SellerNotificationPreferencesResponse>(MOBILE_PLATFORM_API_PATHS.sellerNotificationPreferences)
}

export function updateSellerNotificationPreferences(preferences: SellerNotificationPreferencePatch) {
  return apiFetch<SellerNotificationPreferencesResponse>(MOBILE_PLATFORM_API_PATHS.sellerNotificationPreferences, {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  })
}

export type PublicIdentifierAvailabilityResponse = {
  value: string
  available: boolean
  reason: string
  message: string
  grandfathered?: boolean
  suggestions: string[]
}

export function checkPageSlugAvailability(input: { value: string; subjectId?: string | null }) {
  const params = new URLSearchParams({ namespace: 'page_slug', value: input.value })
  if (input.subjectId) params.set('subjectId', input.subjectId)
  return apiFetch<PublicIdentifierAvailabilityResponse>(
    `${MOBILE_PLATFORM_API_PATHS.publicIdentifierAvailability}?${params.toString()}`,
  )
}

export function updateOrderRequestStatus(input: {
  id: string
  status: 'acknowledged' | 'resolved' | 'declined'
}) {
  return apiFetch<{ ok: true; status: string }>(MOBILE_PLATFORM_API_PATHS.orderRequestStatus, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---- Deal actions (authed; ride on the seller's Bearer token) ----------------
// These call the existing money/state routes, which now accept either the web
// cookie session or `Authorization: Bearer <access_token>`. All ownership +
// guard + Stripe logic stays server-side; the app only sends intent.

export type DealActionResult = {
  ok?: boolean
  status?: string
  settlementState?: string
  operationId?: string
  refundId?: string
  refundedCents?: number
  fully?: boolean
  error?: string
}

// Non-payment status transitions: propose agreement (accept), counter, decline.
export function transitionNegotiation(input: {
  negotiationId: string
  to?: string
  decision?: OwnerNegotiationDecision
  amountCents?: number
}) {
  return apiFetch<DealActionResult>(MOBILE_PLATFORM_API_PATHS.negotiationTransition, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Escrow / money actions: approve a held agreement, capture, cancel, or refund.
// `amount` (major units, e.g. 30 = $30) is optional on refund - omit for the full remainder.
export function escrowAction(input: {
  negotiationId: string
  action: 'approve' | 'capture' | 'cancel' | 'refund'
  amount?: number
}) {
  const send = (body: object) => apiFetch<DealActionResult>(MOBILE_PLATFORM_API_PATHS.negotiationEscrow, {
    method: 'POST', body: JSON.stringify(body),
  })
  return input.action === 'refund'
    ? withRefundIntent(`negotiation:${input.negotiationId}`, input, send)
    : send(input)
}

// Refund a direct checkout order. `amount` (major units) optional - omit for full remainder.
export function refundOrder(input: { orderId: string; amount?: number }) {
  return withRefundIntent(`order:${input.orderId}`, input, (body) => apiFetch<DealActionResult>(MOBILE_PLATFORM_API_PATHS.orderRefund, {
    method: 'POST', body: JSON.stringify(body),
  }))
}

// ---- Seller intake interview (authed; same threads API as web /create) -------
// The app is a thin client (intake spec §7): render agent turns + cards, post
// owner turns. All interview logic (gap analysis, phase machine, provenance,
// invention firewall) lives server-side.

export function listIntakeSessions() {
  return apiFetch<{ ok: boolean; sessions: IntakeSessionSummary[] }>(MOBILE_PLATFORM_API_PATHS.intakeThreads)
}

export function startIntakeSession(input: { source_url?: string; page_id?: string } = {}) {
  return apiFetch<{ ok: boolean; id: string; status: string; phase: string; state: IntakeSessionState }>(
    MOBILE_PLATFORM_API_PATHS.intakeThreads,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function getIntakeSession(id: string) {
  return apiFetch<{ ok: boolean; id: string; status: string; phase: string; pageId: string | null; state: IntakeSessionState }>(
    mobilePlatformApiPath(MOBILE_PLATFORM_API_PATHS.intakeThread, { id }),
  )
}

/** One interview turn: free text (`content`) or structured quick-answers
 *  (`answers`, e.g. Skip / posture chips) - the latter needs no LLM at all. */
export function sendIntakeTurn(id: string, input: { content?: string; answers?: IntakeGapAnswer[] }) {
  return apiFetch<IntakeTurnResponse>(mobilePlatformApiPath(MOBILE_PLATFORM_API_PATHS.intakeMessages, { id }), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** REVIEW_HANDOFF: materialize the draft (new draft listing, or staged onto an
 *  existing one). Idempotent - safe to retry. */
export function commitIntakeSession(id: string) {
  return apiFetch<IntakeCommitResponse>(mobilePlatformApiPath(MOBILE_PLATFORM_API_PATHS.intakeCommit, { id }), {
    method: 'POST',
  })
}
