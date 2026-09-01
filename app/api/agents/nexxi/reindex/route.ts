import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { isPlatformAdmin } from '../../../../../lib/server/plan'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { embedText, isEmbeddingsConfigured, pageEmbeddingText } from '../../../../../lib/agents/semantic-search'
import type { AgentPage } from '../../../../../lib/agent-page'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 60

const MAX_PAGES = 500

/**
 * POST /api/agents/nexxi/reindex - (re)compute pgvector embeddings for published pages so
 * semantic search has data. Platform-admin only; needs the embeddings key + service role.
 * Run once after configuring the key, and whenever page content changes meaningfully.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:reindex', 4, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response
  if (!(await isPlatformAdmin(auth.db, auth.user.id))) {
    return NextResponse.json({ error: 'Forbidden - platform admin only.' }, { status: 403 })
  }
  if (!isEmbeddingsConfigured()) {
    return NextResponse.json({ error: 'Embeddings are not configured (set EMBEDDINGS_API_KEY or OPENAI_API_KEY).' }, { status: 503 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Service role is not configured.' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data: pages, error } = await admin
    .from('pages')
    .select('id, name, slug, description, audience, location, industry, products, services')
    .eq('is_published', true)
    .limit(MAX_PAGES)
    .returns<(AgentPage & { id: string })[]>()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let embedded = 0
  let failed = 0
  for (const page of pages ?? []) {
    const vector = await embedText(pageEmbeddingText(page))
    if (!vector) {
      failed++
      continue
    }
    const { error: upErr } = await admin.from('pages').update({ embedding: vector }).eq('id', page.id)
    if (upErr) failed++
    else embedded++
  }

  return NextResponse.json({ ok: true, total: pages?.length ?? 0, embedded, failed })
}
