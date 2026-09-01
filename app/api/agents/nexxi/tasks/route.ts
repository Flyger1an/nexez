import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

const MAX_PROMPT = 200
const MAX_QUERY = 120
const MAX_CATEGORY = 80
const MAX_ACTIVE_TASKS = 20

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/** GET - the buyer's agent tasks (newest first). Owner-scoped via RLS (buyer facet). */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:tasks', 40, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.db
    .from('agent_tasks')
    .select('id, prompt, query, category, status, created_at')
    .order('created_at', { ascending: false })
    .returns<{ id: string; prompt: string; query: string; category: string; status: string; created_at: string }[]>()
  if (error) {
    console.error('[Nexxi] tasks list failed', error)
    return NextResponse.json({ error: 'Could not load your tasks.' }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    tasks: (data ?? []).map((t) => ({
      id: t.id,
      prompt: t.prompt,
      query: t.query,
      category: t.category,
      status: t.status,
      createdAt: t.created_at,
    })),
  })
}

/**
 * POST { prompt, query?, category? } - create a standing agent task. `prompt` is the buyer's words;
 * `query` (defaults to the prompt) is the match text. Capped per user to avoid runaway alerts.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:tasks', 20, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; query?: unknown; category?: unknown }
  const prompt = clean(body.prompt, MAX_PROMPT)
  const query = clean(body.query, MAX_QUERY) || prompt.slice(0, MAX_QUERY)
  const category = clean(body.category, MAX_CATEGORY)
  if (!prompt) return NextResponse.json({ error: 'Describe what you want Nexxi to keep looking for.' }, { status: 400 })

  const { count } = await auth.db
    .from('agent_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  if ((count ?? 0) >= MAX_ACTIVE_TASKS) {
    return NextResponse.json({ error: 'You have the maximum number of active tasks. Remove one first.' }, { status: 409 })
  }

  const { error } = await auth.db.from('agent_tasks').insert({ user_id: auth.user.id, prompt, query, category })
  if (error) {
    console.error('[Nexxi] create-task failed', error)
    return NextResponse.json({ error: 'Could not create this task.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** PATCH { id, status } - pause/resume a task. */
export async function PATCH(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:tasks', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; status?: unknown }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const status = body.status === 'paused' ? 'paused' : body.status === 'active' ? 'active' : ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || !status) {
    return NextResponse.json({ error: 'A valid task id and status are required.' }, { status: 400 })
  }

  const { error } = await auth.db.from('agent_tasks').update({ status }).eq('id', id)
  if (error) {
    console.error('[Nexxi] update-task failed', error)
    return NextResponse.json({ error: 'Could not update this task.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** DELETE { id } - remove a task. RLS scopes to the caller. */
export async function DELETE(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:tasks', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { id?: unknown }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'A valid task id is required.' }, { status: 400 })
  }

  const { error } = await auth.db.from('agent_tasks').delete().eq('id', id)
  if (error) {
    console.error('[Nexxi] delete-task failed', error)
    return NextResponse.json({ error: 'Could not remove this task.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
