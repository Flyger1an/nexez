import 'server-only'

import { createHash } from 'crypto'
import type { CheckoutEventType } from '../checkout-events'
import type { AnalyticsTrustLevel } from '../contracts/analytics'
import { supabase as publicClient } from '../supabase'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

type IngestionResult = {
  ok: boolean
  replayed: boolean
  error: unknown | null
}
type CheckoutEventInsert = {
  page_id: string
  owner_id: string | null
  slug: string
  offer_key: string
  offer_name: string
  offer_kind: 'services' | 'products'
  event_type: CheckoutEventType
  agent_user_agent?: string | null
  referrer?: string | null
  query?: string | null
  checkout_url?: string | null
  provider_url?: string | null
  stripe_session_id?: string | null
  metadata?: Record<string, unknown>
}

type AgentVisitInsert = {
  page_id: string
  owner_id: string | null
  slug: string
  path: string
  referrer?: string | null
  query?: string | null
  user_agent?: string | null
  ip_hash?: string | null
  is_ai_agent: boolean
  agent_type: string
  confidence_score: number
  detection_signals?: Record<string, unknown>
}

type IngestionOptions = {
  source: string
  /** Stable provider/request identifier when available. */
  replayKey?: string | null
  /** Collapse equivalent browser telemetry inside this window. */
  dedupeWindowMs?: number
  now?: number
}

function analyticsWriter() {
  // Production has the service role. The fallback keeps isolated tests/minimal
  // local environments functional; database grants still reject it after the
  // integrity migration, so it can never reopen the public write path.
  return hasSupabaseAdminEnv() ? createAdminClient() : publicClient
}

function cleanSource(source: string) {
  return source.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 80) || 'server'
}

function ingestionKey(parts: unknown[], options: IngestionOptions): string {
  const now = options.now ?? Date.now()
  const windowMs = Math.max(1_000, options.dedupeWindowMs ?? 10_000)
  const replayPart = options.replayKey?.trim() || `bucket:${Math.floor(now / windowMs)}`
  return createHash('sha256')
    .update(JSON.stringify([cleanSource(options.source), replayPart, ...parts]))
    .digest('hex')
}

function normalizeResult(error: any): IngestionResult {
  if (!error) return { ok: true, replayed: false, error: null }
  if (error.code === '23505') return { ok: true, replayed: true, error: null }
  return { ok: false, replayed: false, error }
}

const VERIFIED: AnalyticsTrustLevel = 'verified_server'

export async function insertVerifiedCheckoutEvent(
  event: CheckoutEventInsert,
  options: IngestionOptions,
): Promise<IngestionResult> {
  const source = cleanSource(options.source)
  const key = ingestionKey([
    event.page_id,
    event.slug,
    event.offer_key,
    event.event_type,
    event.stripe_session_id ?? '',
    event.agent_user_agent ?? '',
    event.referrer ?? '',
  ], options)

  try {
    const { error } = await analyticsWriter().from('checkout_events').insert({
      ...event,
      metadata: event.metadata ?? {},
      ingestion_key: key,
      ingestion_source: source,
      trust_level: VERIFIED,
    })
    return normalizeResult(error)
  } catch (error) {
    return { ok: false, replayed: false, error }
  }
}

export async function insertVerifiedAgentVisit(
  visit: AgentVisitInsert,
  options: IngestionOptions,
): Promise<IngestionResult> {
  const source = cleanSource(options.source)
  const key = ingestionKey([
    visit.page_id,
    visit.slug,
    visit.path,
    visit.ip_hash ?? '',
    visit.user_agent ?? '',
    visit.referrer ?? '',
  ], { dedupeWindowMs: 60_000, ...options })

  try {
    const { error } = await analyticsWriter().from('agent_visits').insert({
      ...visit,
      detection_signals: visit.detection_signals ?? {},
      ingestion_key: key,
      ingestion_source: source,
      trust_level: VERIFIED,
    })
    return normalizeResult(error)
  } catch (error) {
    return { ok: false, replayed: false, error }
  }
}
