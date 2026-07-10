import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { gatherSiteSignals, normalizeScanUrl } from '../../../lib/server/site-scan'
import { AGENT_BOTS, evaluateCrawlability } from '../../../lib/crawlability'
import { captureError, captureEvent } from '../../../lib/observability'

// One page fetch plus bounded agent-manifest, API, llms.txt, and robots probes.
export const maxDuration = 30

/**
 * Public, anonymous agent-legibility scanner (marketing lead-gen). POST { url } →
 * deterministic 0-100 score + per-check breakdown for ANY public website.
 *
 * No auth, no LLM spend, tightly rate-limited (matches /api/simulate-url's 6/60s
 * posture). Every outbound probe goes through the SSRF-guarded shared gatherer;
 * NEVER returns raw fetched page bodies (anti-scraping-relay posture).
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'scan', 6, 60_000)
  if (limited) return limited

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const normalized = normalizeScanUrl(body.url || '')
  if (normalized) {
    const targetHost = new URL(normalized).hostname.toLowerCase()
    const targetLimited = await enforceRateLimit(request, 'scan-target', 30, 60_000, {
      subject: `target:${targetHost}`,
      failClosed: true,
    })
    if (targetLimited) return targetLimited
  }

  try {
    const result = await gatherSiteSignals(body.url || '')
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const report = evaluateCrawlability(result.signals)
    captureEvent('scan.run', { host: new URL(result.origin).host, score: report.score, ms: result.elapsedMs })

    return NextResponse.json(
      {
        ok: true,
        url: result.url,
        origin: result.origin,
        elapsedMs: result.elapsedMs,
        scannedAt: new Date().toISOString(),
        version: report.version,
        score: report.score,
        dimensions: report.dimensions,
        checks: report.checks,
        agentBots: AGENT_BOTS,
        blockedBots: AGENT_BOTS.filter((b) => !result.robots[b]),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureError(error, { route: 'scan' })
    return NextResponse.json({ error: 'Scan failed. Please try again.' }, { status: 500 })
  }
}
