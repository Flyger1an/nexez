import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { enhanceDescriptionForAgents } from '../../../../lib/ai-optimize'
import { isLlmConfigured, llmComplete } from '../../../../lib/llm'
import { ownerAllows } from '../../../../lib/server/plan'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'
import { enforceRateLimit } from '../../../../lib/rate-limit'

/**
 * Enhance an offer description for agents. Uses a real LLM when configured
 * (LLM_API_KEY) AND the page has opted in (llm_opt_in); otherwise falls back to
 * the deterministic rewriter. Returns the source so the UI can label it.
 *
 * Collaboration: when a `pageId` is supplied, an editor-collaborator (not just the
 * page owner) may call this — access is resolved via resolvePageAccess and BOTH the
 * opt-in read and the AI plan gate are decided against the PAGE OWNER. Without a
 * pageId we keep the legacy self-gate (an owner enhancing ad-hoc copy for themselves).
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

  const pageId = (body.pageId || '').trim()

  // Opt-in check + plan gate. When a pageId is present we authorize the caller as the
  // page owner OR an editor-collaborator, then decide BOTH the opt-in and the AI plan
  // gate against the page OWNER via the service-role client (a collaborator's session
  // client cannot read the owner's rows under RLS). Without a pageId we keep the legacy
  // self-gate: no opt-in source, plan gate on the logged-in user (their own copy).
  let optedIn = false
  let aiAllowed = false

  if (pageId) {
    if (!hasSupabaseAdminEnv()) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const access = await resolvePageAccess({
      pageId,
      userId: user.id,
      userEmail: user.email,
      userEmailConfirmedAt: user.email_confirmed_at,
      requireEditor: true,
    })
    if (!access) {
      return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data } = await admin
      .from('pages')
      .select('llm_opt_in')
      .eq('id', access.pageId)
      .maybeSingle<{ llm_opt_in?: boolean }>()
    optedIn = Boolean(data?.llm_opt_in)

    // Plan gate on the OWNER, not the logged-in collaborator.
    aiAllowed = await ownerAllows(admin, access.ownerId, 'aiFeatures')
  } else {
    // Legacy self-gate: owner enhancing their own copy with no page context.
    aiAllowed = await ownerAllows(supabase, user.id, 'aiFeatures')
  }

  // Plan gate: AI features unlock on Launch+. Below that we still return a useful
  // result via the deterministic path (no error) — the LLM call is what's gated.
  if (isLlmConfigured() && optedIn && aiAllowed) {
    try {
      const enhanced = await llmComplete(
        `Rewrite this ${businessName} offer description so AI agents can clearly understand and act on it. Keep it factual, concise, include concrete specifics (what's included, who it's for: ${audience}). Return only the rewritten description.\n\n"${description}"`,
        { system: 'You optimize business offer descriptions for AI agent consumption. Be concise and factual; never invent prices or claims.', maxTokens: 300 },
      )
      if (enhanced) return NextResponse.json({ enhanced, source: 'llm' })
    } catch (e) {
      captureError(e, { route: 'ai-enhance', pageId: pageId || undefined })
      // fall through to deterministic
    }
  }

  return NextResponse.json({
    enhanced: enhanceDescriptionForAgents(description, businessName, audience),
    source: 'deterministic',
  })
}
