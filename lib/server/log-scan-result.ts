import 'server-only'
import { createHash } from 'crypto'
import { after } from 'next/server'
import { AGENT_BOTS, type CrawlabilityReport, type CrawlabilitySignals } from '../crawlability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { captureError } from '../observability'

/**
 * Appends one anonymized row to scan_results per completed public scan.
 *
 * Privacy contract (mirrors the migration): aggregate analytics only ever use
 * domain_hash; the raw hostname lands in a service-role-only column purely for
 * operational debugging and must never be surfaced in aggregate output. No IPs,
 * no user identifiers, no page bodies.
 */

export type ScanResultInput = {
  origin: string
  elapsedMs: number
  signals: CrawlabilitySignals
  report: CrawlabilityReport
  source?: 'organic' | 'study'
  studyCohort?: string | null
  vertical?: string | null
}

const MAX_STORED_SCHEMA_TYPES = 25

export function hashScanDomain(hostname: string): string {
  const salt =
    process.env.SCAN_DOMAIN_HASH_SALT ||
    process.env.AGENT_VISIT_HASH_SALT ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'nexez-scan'
  return createHash('sha256').update(`${salt}:${hostname.toLowerCase()}`).digest('hex')
}

/** Pure row builder so the exact persisted shape is unit-testable. */
export function buildScanResultRow(input: ScanResultInput): Record<string, unknown> | null {
  let hostname: string
  try {
    hostname = new URL(input.origin).hostname.toLowerCase()
  } catch {
    return null
  }
  if (!hostname) return null

  const { signals, report } = input
  const dimensionScores = Object.fromEntries(
    Object.entries(report.dimensions).map(([dimension, value]) => [dimension, value.score]),
  )

  return {
    source: input.source ?? 'organic',
    study_cohort: input.studyCohort ?? null,
    vertical: input.vertical ?? null,
    domain_hash: hashScanDomain(hostname),
    domain: hostname,
    scanner_version: report.version,
    score: report.score,
    dimension_scores: dimensionScores,
    elapsed_ms: input.elapsedMs,
    http_status: signals.status,
    response_ms: signals.responseMs,
    https: signals.https,
    has_title: signals.hasTitle,
    has_meta_description: signals.hasMetaDescription,
    has_h1: signals.hasH1,
    has_json_ld: signals.hasJsonLd,
    valid_json_ld: signals.validJsonLd,
    schema_types: signals.schemaTypes.slice(0, MAX_STORED_SCHEMA_TYPES),
    has_business_identity: signals.hasBusinessIdentity,
    has_offer_schema: signals.hasOfferSchema,
    has_structured_price: signals.hasStructuredPrice,
    has_visible_price: signals.hasVisiblePrice,
    has_action_path: signals.hasActionPath,
    has_structured_action: signals.hasStructuredAction,
    has_structured_availability: signals.hasStructuredAvailability,
    has_visible_availability: signals.hasVisibleAvailability,
    has_offer_details: signals.hasOfferDetails,
    has_contact: signals.hasContact,
    has_policies: signals.hasPolicies,
    has_freshness_signal: signals.hasFreshnessSignal,
    agent_json_ok: signals.agentJsonOk,
    well_known_agent_json_ok: signals.wellKnownAgentJsonOk,
    well_known_agent_card_ok: signals.wellKnownAgentCardOk,
    mcp_json_ok: signals.mcpJsonOk,
    open_api_json_ok: signals.openApiJsonOk,
    llms_txt_ok: signals.llmsTxtOk,
    robots: signals.robots,
    blocked_bot_count: AGENT_BOTS.filter((bot) => !signals.robots[bot]).length,
  }
}

/** Insert now. No-ops without admin env; never throws into the caller. */
export async function persistScanResult(input: ScanResultInput): Promise<void> {
  if (!hasSupabaseAdminEnv()) return
  const row = buildScanResultRow(input)
  if (!row) return
  try {
    const { error } = await createAdminClient().from('scan_results').insert(row)
    if (error) captureError(error, { route: 'scan', op: 'persist_scan_result' })
  } catch (error) {
    captureError(error, { route: 'scan', op: 'persist_scan_result' })
  }
}

/**
 * Schedule persistence AFTER the response streams out so the public scan's
 * user-facing latency is untouched. Outside a Next request scope (unit tests,
 * scripts) after() throws synchronously; fall back to fire-and-forget.
 */
export function scheduleScanResultPersist(input: ScanResultInput): void {
  try {
    after(() => persistScanResult(input))
  } catch {
    void persistScanResult(input)
  }
}
