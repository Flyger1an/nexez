import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { gatherSiteSignals } from '../../../lib/server/site-scan'
import { AGENT_BOTS, evaluateCrawlability } from '../../../lib/crawlability'

// One page fetch plus bounded agent-manifest, API, llms.txt, and robots probes.
export const maxDuration = 30

/**
 * B6 - Agent crawlability test.
   * POST { url } fetches the public URL and bounded discovery artifacts, then returns a deterministic
 * agent-readiness report. Safe to call for any public URL (only issues GETs,
 * polite UA, short timeouts, hard byte caps).
 *
 * The fetch composition + SSRF guarding live in lib/server/site-scan
 * (shared with the public /api/scan lead-gen scanner so the two never drift).
 * Response shape is depended on by the dashboard settings crawlability button.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'crawlability', 10, 60_000)
  if (limited) return limited

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await gatherSiteSignals(body.url || '')
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const report = evaluateCrawlability(result.signals)

  return NextResponse.json({
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
  })
}
