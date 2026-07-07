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
  return apiFetch<SimulationResult>('/api/simulate-llm', {
    auth: false,
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function runDemoSimulation(query: string) {
  return apiFetch<SimulationResult>('/api/public-simulate', {
    auth: false,
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export function webPath(path: string) {
  return `${config.apiUrl}${path.startsWith('/') ? path : `/${path}`}`
}

// ---- Deal actions (authed; ride on the seller's Bearer token) ----------------
// These call the existing money/state routes, which now accept either the web
// cookie session or `Authorization: Bearer <access_token>`. All ownership +
// guard + Stripe logic stays server-side; the app only sends intent.

export type DealActionResult = {
  ok?: boolean
  status?: string
  settlementState?: string
  refundId?: string
  refundedCents?: number
  fully?: boolean
  error?: string
}

export type OwnerMessage = {
  action: 'accept' | 'counter' | 'reject' | 'clarify'
  reasoning: string
  proposed_price?: number
  proposed_date?: string
  scope_notes?: string
}

// Non-payment status transitions: propose agreement (accept), counter, decline.
export function transitionNegotiation(input: {
  negotiationId: string
  to?: string
  ownerMessage?: OwnerMessage
  amountCents?: number
}) {
  return apiFetch<DealActionResult>('/api/negotiations/transition', {
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
  return apiFetch<DealActionResult>('/api/negotiations/escrow', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Refund a direct checkout order. `amount` (major units) optional - omit for full remainder.
export function refundOrder(input: { orderId: string; amount?: number }) {
  return apiFetch<DealActionResult>('/api/orders/refund', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---- Seller intake interview (authed; same threads API as web /create) -------
// The app is a thin client (intake spec §7): render agent turns + cards, post
// owner turns. All interview logic (gap analysis, phase machine, provenance,
// invention firewall) lives server-side.

export function listIntakeSessions() {
  return apiFetch<{ ok: boolean; sessions: IntakeSessionSummary[] }>('/api/agents/intake/threads')
}

export function startIntakeSession(input: { source_url?: string; page_id?: string } = {}) {
  return apiFetch<{ ok: boolean; id: string; status: string; phase: string; state: IntakeSessionState }>(
    '/api/agents/intake/threads',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function getIntakeSession(id: string) {
  return apiFetch<{ ok: boolean; id: string; status: string; phase: string; pageId: string | null; state: IntakeSessionState }>(
    `/api/agents/intake/threads/${id}`,
  )
}

/** One interview turn: free text (`content`) or structured quick-answers
 *  (`answers`, e.g. Skip / posture chips) - the latter needs no LLM at all. */
export function sendIntakeTurn(id: string, input: { content?: string; answers?: IntakeGapAnswer[] }) {
  return apiFetch<IntakeTurnResponse>(`/api/agents/intake/threads/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** REVIEW_HANDOFF: materialize the draft (new draft listing, or staged onto an
 *  existing one). Idempotent - safe to retry. */
export function commitIntakeSession(id: string) {
  return apiFetch<IntakeCommitResponse>(`/api/agents/intake/threads/${id}/commit`, { method: 'POST' })
}
