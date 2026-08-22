import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { analyzeSite, getImportUrlError } from '../../../lib/importer'
import { buildUrlSimComparison } from '../../../lib/url-simulation'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { captureError } from '../../../lib/observability'
import {
  AGENT_LAB_RESEARCH_SELECT,
  researchEvidence,
  researchTargetUrl,
  researchRowToRun,
  targetHost,
  type AgentLabResearchRow,
} from '../../../lib/agent-lab-research'
import { createClient } from '../../../utils/supabase/server'

// Deterministic multi-page crawl; give headroom but stay well under the demo's
// own timeout race below.
export const maxDuration = 20

/**
 * Public, UNAUTHENTICATED "simulate any URL" demo for /simulator.
 *
 * Safety posture for an outward-facing, anonymous crawler:
 * - SSRF: analyzeSite() validates the host (sync pattern + DNS-resolved IP) and
 *   fetches only via the SSRF-safe path - localhost/private/link-local are blocked.
 * - Cost: runs DETERMINISTIC ONLY (skipLlm) so anonymous traffic never spends on
 *   the LLM; the crawl still returns real structured offers (schema.org/JSON-LD,
 *   common paths, Shopify, agent docs).
 * - Abuse: hard rate limit + a short overall timeout. We return a summarized
 *   comparison, never raw fetched page bodies, so it isn't a general scraping relay.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'simulate-url', 6, 60_000)
  if (limited) return limited

  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  const save = body?.save === true
  if (!url) return NextResponse.json({ error: 'A website URL is required.' }, { status: 400 })

  // Fast, friendly rejection before we spend a crawl on an obviously bad/blocked host.
  const urlError = getImportUrlError(url)
  if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })

  let saveContext: { supabase: ReturnType<typeof createClient>; userId: string } | null = null
  if (save) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in to save URL research.' }, { status: 401 })
    saveContext = { supabase, userId: user.id }
  }

  const OVERALL_TIMEOUT_MS = 16_000
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('That site took too long to crawl. Try a simpler URL.')), OVERALL_TIMEOUT_MS),
  )

  try {
    const result = await Promise.race([analyzeSite(url, null, { skipLlm: true }), timeout])
    const comparison = buildUrlSimComparison(url, result)
    if (saveContext) {
      const evidence = researchEvidence('url_snapshot')
      const storedUrl = researchTargetUrl(comparison.url)
      const storedComparison = { ...comparison, url: storedUrl }
      const { data, error } = await saveContext.supabase
        .from('agent_lab_research_runs')
        .insert({
          owner_id: saveContext.userId,
          kind: 'url_snapshot',
          target_url: storedUrl,
          target_host: targetHost(storedUrl),
          compared_page_id: null,
          compared_page_slug: null,
          result: storedComparison,
          evidence,
        })
        .select(AGENT_LAB_RESEARCH_SELECT)
        .single<AgentLabResearchRow>()

      return NextResponse.json({
        ok: true,
        ...comparison,
        savedRun: data ? researchRowToRun(data) : null,
        ...(error ? { persistenceError: 'The scan completed, but it could not be saved to private research history.' } : {}),
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    return NextResponse.json(
      { ok: true, ...comparison },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
    )
  } catch (error) {
    captureError(error, { route: 'simulate-url' })
    const message = error instanceof Error ? error.message : 'Could not analyze that URL.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
