import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../../../lib/agents/nexie-auth'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'

export const maxDuration = 30

type WireMessage = { id: string; role: 'user' | 'assistant'; content: string; cards?: unknown[] }

/**
 * GET /api/agents/nexie/threads/[id] - a single conversation's messages, mapped to the
 * mobile chat shape so the app can RESUME it. Assistant cards are restored from the
 * message metadata. Owner-scoped (RLS + explicit user_id match); 404 if not the owner's.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'agents:nexie:thread', 40, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const { data: thread, error: threadError } = await auth.db
      .from('agent_threads')
      .select('id, title')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle<{ id: string; title: string }>()
    if (threadError) throw threadError
    if (!thread) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

    const { data: rows, error: messagesError } = await auth.db
      .from('agent_messages')
      .select('id, role, content, metadata, created_at')
      .eq('thread_id', id)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(200)
    if (messagesError) throw messagesError

    const messages: WireMessage[] = (rows ?? [])
      .filter((r) => r.role === 'USER' || r.role === 'ASSISTANT')
      .map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>
        const cards = r.role === 'ASSISTANT' && Array.isArray(meta.cards) ? (meta.cards as unknown[]) : undefined
        return {
          id: r.id,
          role: r.role === 'USER' ? 'user' : 'assistant',
          content: r.content,
          ...(cards && cards.length ? { cards } : {}),
        }
      })

    return NextResponse.json({ ok: true, threadId: id, title: thread.title, messages })
  } catch (error) {
    console.error('[Nexie] thread load failed', error)
    return NextResponse.json({ error: 'Could not load that conversation.' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/nexie/threads/[id] - rename ({ title }) and/or archive ({ archived }).
 * Owner-scoped; the title is trimmed + length-capped server-side.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'agents:nexie:thread', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  let body: { title?: unknown; archived?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string') {
    const title = body.title.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (title) patch.title = title
  }
  if (typeof body.archived === 'boolean') patch.status = body.archived ? 'ARCHIVED' : 'ACTIVE'
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  try {
    const { error } = await auth.db.from('agent_threads').update(patch).eq('id', id).eq('user_id', auth.user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Nexie] thread update failed', error)
    return NextResponse.json({ error: 'Could not update that conversation.' }, { status: 500 })
  }
}
