import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { generateLlmsTxtForUrl } from '../../../../lib/server/llms-txt-generator'
import { normalizeScanUrl } from '../../../../lib/server/site-scan'
import { captureError } from '../../../../lib/observability'

// One capped page fetch, no probes.
export const maxDuration = 15

/**
 * Public, anonymous llms.txt generator (marketing lead-gen). POST { url } →
 * { llmsTxt, sourceUrl }. Deterministic (no LLM spend); same rate-limit posture
 * and SSRF-guarded fetch path as /api/scan.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'llms-txt-gen', 6, 60_000)
  if (limited) return limited

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Per-target cap so the tool can't be pointed at one victim host in a loop.
  const normalized = normalizeScanUrl(body.url || '')
  if (normalized) {
    const targetHost = new URL(normalized).hostname.toLowerCase()
    const targetLimited = await enforceRateLimit(request, 'llms-txt-gen-target', 30, 60_000, {
      subject: `target:${targetHost}`,
      failClosed: true,
    })
    if (targetLimited) return targetLimited
  }

  try {
    const result = await generateLlmsTxtForUrl(body.url || '')
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (error) {
    captureError(error, { route: 'tools/llms-txt' })
    return NextResponse.json({ error: 'Generation failed. Try again.' }, { status: 500 })
  }
}
