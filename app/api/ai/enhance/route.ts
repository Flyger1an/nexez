import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import {
  enhanceDescriptionForAgents,
  rewriteOfferForAgents,
} from '../../../../lib/ai-optimize'
import type { OfferItem } from '../../../../lib/agent-page'
import { isLlmConfigured, llmComplete } from '../../../../lib/llm'
import { ownerAllows } from '../../../../lib/server/plan'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'
import { enforceRateLimit } from '../../../../lib/rate-limit'

/**
 * Launch+ offer-description optimization. Uses a real LLM when configured
 * (LLM_API_KEY) AND the page has opted in (llm_opt_in); otherwise an entitled
 * caller receives the deterministic rewriter. Free callers receive 402 and no
 * rewritten copy.
 *
 * Collaboration: when a `pageId` is supplied, an editor-collaborator (not just the
 * page owner) may call this - access is resolved via resolvePageAccess and BOTH the
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

  let body: {
    operation?: 'enhance_description' | 'enhance_offers' | 'optimize_offers' | 'authorize'
    description?: string
    offers?: OfferItem[]
    businessName?: string
    audience?: string
    pageId?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const operation = body.operation ?? 'enhance_description'
  if (!['enhance_description', 'enhance_offers', 'optimize_offers', 'authorize'].includes(operation)) {
    return NextResponse.json({ error: 'Unsupported enhancement operation' }, { status: 400 })
  }
  const description = (body.description || '').trim()
  const offers = Array.isArray(body.offers)
    ? body.offers.filter((offer): offer is OfferItem => Boolean(offer && typeof offer === 'object')).slice(0, 100)
    : []
  if (operation === 'enhance_description' && !description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }
  if ((operation === 'enhance_offers' || operation === 'optimize_offers') && offers.length === 0) {
    return NextResponse.json({ error: 'offers are required' }, { status: 400 })
  }
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

  // The optimization itself is a Launch+ capability, including the deterministic
  // rewriter. This server check prevents stale or modified clients from bypassing
  // a downgrade.
  if (!aiAllowed) {
    return NextResponse.json(
      { error: 'AI optimization is available on the Launch plan and above.', code: 'plan_upgrade_required' },
      { status: 402 },
    )
  }

  // Bulk editor actions stay deterministic, but execute only after this live
  // owner-entitlement check. Keeping the transformation server-side prevents an
  // already-open editor from continuing paid rewrites after a downgrade.
  if (operation === 'authorize') {
    return NextResponse.json({ authorized: true })
  }
  if (operation === 'optimize_offers') {
    return NextResponse.json({
      offers: offers.map((offer) => rewriteOfferForAgents(offer, { businessName, audience })),
      source: 'deterministic',
    })
  }
  if (operation === 'enhance_offers') {
    return NextResponse.json({
      offers: offers.map((offer) => ({
        ...offer,
        description: enhanceDescriptionForAgents(offer.description || '', businessName, audience),
      })),
      source: 'deterministic',
    })
  }

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
