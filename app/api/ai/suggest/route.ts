import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { isLlmConfigured, llmComplete } from '../../../../lib/llm'
import { ownerAllows } from '../../../../lib/server/plan'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'
import { enforceRateLimit } from '../../../../lib/rate-limit'

/**
 * Server-side LLM suggestions for the page editor (agent-memory notes + approval
 * notes). These used to run client-side via a dynamic `import('lib/llm')`, which
 * was both UNGATED and broken (LLM_API_KEY is server-only, so the browser call
 * fired with an undefined key and silently failed). Moving them here closes the
 * gate — auth + `aiFeatures` (Launch+) + the page's `llm_opt_in` consent — and
 * makes the feature actually work. The page is loaded scoped to the owner so the
 * prompt is built from trusted server data, never client-supplied page content.
 *
 * Collaboration: authorization runs through `resolvePageAccess` (owner OR a
 * non-revoked editor invitee), and the plan gate + page read act as the PAGE
 * OWNER via the service-role client — so an editor-collaborator inherits the
 * owner's plan and works against the owner's data, while a non-editor still 403s.
 */
type SuggestKind = 'memory' | 'approval-note'

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'ai-suggest', 20, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { pageId?: string; kind?: SuggestKind }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const pageId = (body.pageId || '').trim()
  const kind: SuggestKind = body.kind === 'approval-note' ? 'approval-note' : 'memory'
  if (!pageId) return NextResponse.json({ error: 'pageId is required' }, { status: 400 })

  // Authorize as owner OR a non-revoked editor-collaborator. This is the ONLY
  // authorization — trust its result. Needs the service-role env to read the
  // page/invite authoritatively.
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })
  }
  const access = await resolvePageAccess({
    pageId,
    userId: user.id,
    userEmail: user.email,
    requireEditor: true,
  })
  if (!access) {
    return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Load the page scoped to the OWNER via the admin client — ownership is already
  // proven by resolvePageAccess (look it up by id), and the service-role read sees
  // the owner's row regardless of the collaborator's RLS. Trusted server data to
  // build the prompt from (never trust client-supplied page content).
  const { data: page } = await admin
    .from('pages')
    .select('name, description, audience, services, products, llm_opt_in')
    .eq('id', access.pageId)
    .eq('owner_id', access.ownerId)
    .maybeSingle<{
      name?: string | null
      description?: string | null
      audience?: string | null
      services?: unknown
      products?: unknown
      llm_opt_in?: boolean | null
    }>()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  // Plan gate on the OWNER (not the logged-in collaborator): AI suggestions
  // unlock on Launch+ (aiFeatures).
  if (!(await ownerAllows(admin, access.ownerId, 'aiFeatures'))) {
    return NextResponse.json(
      { error: 'AI suggestions are a Launch feature. Upgrade to use AI, or write the note manually.' },
      { status: 402 },
    )
  }
  // Consent gate: the page must have AI assist enabled.
  if (!page.llm_opt_in) {
    return NextResponse.json(
      { error: 'Enable "Advanced AI Assist" for this page first to use AI suggestions.' },
      { status: 403 },
    )
  }
  if (!isLlmConfigured()) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })
  }

  const name = page.name || 'the page'
  try {
    if (kind === 'approval-note') {
      const suggestion = await llmComplete(
        `Suggest a short professional approval request note for a business offer update on "${name}". Keep under 60 chars, factual.`,
        { maxTokens: 30 },
      )
      return NextResponse.json({ suggestion: (suggestion || '').trim().slice(0, 80) })
    }

    const offers = (page as { services?: unknown }).services || (page as { products?: unknown }).products || []
    const pageData = `Name: ${name}. Description: ${page.description || ''}. Offers: ${JSON.stringify(offers)}. Audience: ${page.audience || ''}`
    const suggestion = await llmComplete(
      `From this page data, generate 2-4 concise persistent memory notes for AI agents (e.g. buyer prefs, restrictions, key facts to always mention). One per line, factual only. Data: ${pageData}`,
      { maxTokens: 150 },
    )
    return NextResponse.json({ suggestion: (suggestion || '').trim() })
  } catch (e) {
    captureError(e, { route: 'ai-suggest', pageId, kind })
    return NextResponse.json({ error: 'AI suggestion failed. Please try again or write it manually.' }, { status: 502 })
  }
}
