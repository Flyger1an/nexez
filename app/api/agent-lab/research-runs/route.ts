import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  AGENT_LAB_RESEARCH_SELECT,
  researchRowToRun,
  type AgentLabResearchKind,
  type AgentLabResearchRow,
} from '@/lib/agent-lab-research'
import { enforceRateLimit } from '@/lib/rate-limit'
import { createClient } from '@/utils/supabase/server'

const HISTORY_LIMIT = 100
const KINDS = new Set<AgentLabResearchKind>(['url_snapshot', 'competitor_benchmark'])

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view saved research.' }, { status: 401 })

  const url = new URL(request.url)
  const rawKind = url.searchParams.get('kind')
  const kind = rawKind && KINDS.has(rawKind as AgentLabResearchKind)
    ? rawKind as AgentLabResearchKind
    : null
  if (rawKind && !kind) return NextResponse.json({ error: 'Unknown research kind.' }, { status: 400 })

  const requestedLimit = Number(url.searchParams.get('limit') || 30)
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(HISTORY_LIMIT, Math.floor(requestedLimit)))
    : 30

  let query = supabase
    .from('agent_lab_research_runs')
    .select(AGENT_LAB_RESEARCH_SELECT)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query.returns<AgentLabResearchRow[]>()
  if (error) return NextResponse.json({ error: 'Could not load saved research.' }, { status: 500 })

  return NextResponse.json({ runs: (data ?? []).map(researchRowToRun) })
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit(request, 'agent-lab-research-delete', 30, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to remove saved research.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { id?: unknown }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'A valid research run id is required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('agent_lab_research_runs')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) return NextResponse.json({ error: 'Could not remove saved research.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Saved research not found.' }, { status: 404 })

  return NextResponse.json({ removed: true, id: data.id })
}
