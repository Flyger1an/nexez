import { NextResponse } from 'next/server'
import { analyzeSite, getImportUrlError } from '../../../lib/importer'
import { buildUrlSimComparison } from '../../../lib/url-simulation'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { captureError } from '../../../lib/observability'

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
  if (!url) return NextResponse.json({ error: 'A website URL is required.' }, { status: 400 })

  // Fast, friendly rejection before we spend a crawl on an obviously bad/blocked host.
  const urlError = getImportUrlError(url)
  if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })

  const OVERALL_TIMEOUT_MS = 16_000
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('That site took too long to crawl. Try a simpler URL.')), OVERALL_TIMEOUT_MS),
  )

  try {
    const result = await Promise.race([analyzeSite(url, null, { skipLlm: true }), timeout])
    return NextResponse.json(
      { ok: true, ...buildUrlSimComparison(url, result) },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
    )
  } catch (error) {
    captureError(error, { route: 'simulate-url' })
    const message = error instanceof Error ? error.message : 'Could not analyze that URL.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
