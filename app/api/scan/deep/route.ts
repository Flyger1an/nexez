import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { ownerAllows } from '../../../../lib/server/plan'
import { isLlmConfigured } from '../../../../lib/llm'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { captureError, captureEvent } from '../../../../lib/observability'
import { runDeepScan } from '../../../../lib/server/deep-scan'

// One page fetch + probes + up to one ~15s LLM call.
export const maxDuration = 30

/**
 * The GATED deep agent-legibility report (signed-in). The anonymous /api/scan
 * stays deterministic; here we add the LLM comprehension refinement + agent's-eye
 * read for accounts on an aiFeatures plan (Launch+ / any active trial). Below that
 * — or if the LLM is unconfigured — it degrades to the deterministic report with
 * an upgrade hint, never a hard error. Host-neutral so the marketing /scan page
 * can call it same-origin under the shared .nexez.ai session cookie.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'scan-deep', 10, 60_000)
  if (limited) return limited

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to run the deep agent-comprehension report.' }, { status: 401 })
  }

  // aiFeatures (Launch+ / active trial) unlocks the LLM pass; below that the report
  // is still returned, deterministic-only, with an upgrade nudge. Owner-scoped read.
  const aiAllowed = await ownerAllows(supabase, user.id, 'aiFeatures')
  const llmEnabled = isLlmConfigured() && aiAllowed

  try {
    const result = await runDeepScan(body.url || '', { llm: llmEnabled })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    captureEvent('scan.deep', { host: new URL(result.origin).host, score: result.score, llm: result.llmAssisted })
    return NextResponse.json({
      ...result,
      // Signed in but not on an aiFeatures plan → tell the UI to show the upgrade path.
      upgradeHint: !aiAllowed ? 'Upgrade to a plan with AI features for the agent-comprehension read.' : undefined,
    })
  } catch (error) {
    captureError(error, { route: 'scan-deep' })
    return NextResponse.json({ error: 'Could not complete the deep scan. Please try again.' }, { status: 500 })
  }
}
