import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enhanceDescriptionForAgents } from '../../../../lib/ai-optimize'
import { isLlmConfigured, llmComplete } from '../../../../lib/llm'
import { ownerAllows } from '../../../../lib/server/plan'
import { captureError } from '../../../../lib/observability'
import { enforceRateLimit } from '../../../../lib/rate-limit'

/**
 * Enhance an offer description for agents. Uses a real LLM when configured
 * (LLM_API_KEY) AND the page has opted in (llm_opt_in); otherwise falls back to
 * the deterministic rewriter. Returns the source so the UI can label it.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'ai-enhance', 20, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { description?: string; businessName?: string; audience?: string; pageId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const description = (body.description || '').trim()
  if (!description) return NextResponse.json({ error: 'description is required' }, { status: 400 })
  const businessName = body.businessName || 'This business'
  const audience = body.audience || 'qualified buyers'

  // Opt-in check: only use the LLM when the page enabled it.
  let optedIn = false
  if (body.pageId) {
    const { data } = await supabase
      .from('pages')
      .select('llm_opt_in')
      .eq('id', body.pageId)
      .maybeSingle<{ llm_opt_in?: boolean }>()
    optedIn = Boolean(data?.llm_opt_in)
  }

  // Plan gate: AI features unlock on Launch+. Below that we still return a useful
  // result via the deterministic path (no error) — the LLM call is what's gated.
  const aiAllowed = await ownerAllows(supabase, user.id, 'aiFeatures')

  if (isLlmConfigured() && optedIn && aiAllowed) {
    try {
      const enhanced = await llmComplete(
        `Rewrite this ${businessName} offer description so AI agents can clearly understand and act on it. Keep it factual, concise, include concrete specifics (what's included, who it's for: ${audience}). Return only the rewritten description.\n\n"${description}"`,
        { system: 'You optimize business offer descriptions for AI agent consumption. Be concise and factual; never invent prices or claims.', maxTokens: 300 },
      )
      if (enhanced) return NextResponse.json({ enhanced, source: 'llm' })
    } catch (e) {
      captureError(e, { route: 'ai-enhance', pageId: body.pageId })
      // fall through to deterministic
    }
  }

  return NextResponse.json({
    enhanced: enhanceDescriptionForAgents(description, businessName, audience),
    source: 'deterministic',
  })
}
