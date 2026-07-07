import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { sendPushToUser } from '../../../../lib/push'
import { captureError } from '../../../../lib/observability'

// Agent tasks (Vercel cron - see vercel.json). For each ACTIVE buyer task, matches its query/category
// against the WHOLE published catalog (existing + new) and pushes the buyer on any match it hasn't told
// them about yet (deduped per task via notified_slugs). This is the "agent works while you're away"
// runner - distinct from saved-search alerts, which only fire on freshly-published pages.
//
// NOTIFY only - money never moves here; the buyer still approves any purchase in-app. sendPushToUser
// honors each user's notifications pref (fail-open).
//
// Protected: scheduled runs must send `Authorization: Bearer ${CRON_SECRET}`.

export const maxDuration = 60
const PAGE_LIMIT = 1000 // bound the catalog scan
const TASK_LIMIT = 2000
const MAX_NOTIFY_PER_RUN = 3 // don't dump the whole catalog into one push burst
const NOTIFIED_CAP = 300 // keep notified_slugs from growing unbounded

type CatalogPage = {
  slug: string
  name: string | null
  description: string | null
  industry: string | null
  location: string | null
}
type AgentTask = { id: string; user_id: string; prompt: string; query: string; category: string; notified_slugs: string[] }

function pageText(p: CatalogPage): string {
  return `${p.name ?? ''} ${p.description ?? ''} ${p.industry ?? ''} ${p.location ?? ''}`.toLowerCase()
}

// Mirror the Discover client match: category exact (industry), query as a substring of the page text.
function matches(p: CatalogPage, t: AgentTask): boolean {
  if (t.category && (p.industry ?? '').toLowerCase() !== t.category.toLowerCase()) return false
  const q = t.query.trim().toLowerCase()
  if (q && !pageText(p).includes(q)) return false
  return true
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  try {
    const { data: pages } = await admin
      .from('pages_public')
      .select('slug, name, description, industry, location')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT)
      .returns<CatalogPage[]>()

    const catalog = pages ?? []
    if (!catalog.length) {
      return NextResponse.json({ ok: true, processed: 0, notified: 0, reason: 'empty_catalog' })
    }

    const { data: tasks } = await admin
      .from('agent_tasks')
      .select('id, user_id, prompt, query, category, notified_slugs')
      .eq('status', 'active')
      .limit(TASK_LIMIT)
      .returns<AgentTask[]>()

    let notified = 0
    for (const t of tasks ?? []) {
      const seen = new Set(t.notified_slugs ?? [])
      const fresh = catalog.filter((p) => !seen.has(p.slug) && matches(p, t))
      // Always advance last_run_at so we have a heartbeat even when nothing matched.
      if (!fresh.length) {
        await admin.from('agent_tasks').update({ last_run_at: nowIso }).eq('id', t.id)
        continue
      }

      const top = fresh.slice(0, MAX_NOTIFY_PER_RUN)
      const label = t.prompt || t.query || t.category || 'your task'
      await sendPushToUser(t.user_id, {
        title: 'Nexxi found a match',
        body:
          top.length === 1
            ? `${top[0].name ?? 'A business'} matches "${label}".`
            : `${top.length} businesses match "${label}".`,
        data: { type: 'agent_task', taskId: t.id, query: t.query, category: t.category, slug: top[0].slug },
        category: 'tasks',
      })

      // Record EVERY fresh match as seen (not just the few we surfaced) so we don't re-push them next run.
      const nextSeen = [...fresh.map((p) => p.slug), ...(t.notified_slugs ?? [])].slice(0, NOTIFIED_CAP)
      await admin.from('agent_tasks').update({ notified_slugs: nextSeen, last_run_at: nowIso }).eq('id', t.id)
      notified += 1
    }

    return NextResponse.json({ ok: true, processed: (tasks ?? []).length, notified })
  } catch (error) {
    captureError(error instanceof Error ? error : new Error('agent-tasks failed'), { scope: 'cron:agent-tasks' })
    return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 })
  }
}
