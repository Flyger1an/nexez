import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { AgentPage } from '../../../../lib/agent-page'
import { DEFAULT_STALE_DAYS, daysSince, isStale } from '../../../../lib/freshness'

/**
 * Scheduled freshness monitor (Vercel cron — see vercel.json).
 * Scans published pages and reports those that may have drifted from their
 * source site (stale + has website_url). Read-only telemetry today; the report
 * is the hook for future notifications (ties into the notifications feature).
 *
 * Protected: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` when
 * CRON_SECRET is set; we require it when present.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('pages')
    .select('id, slug, name, website_url, is_published, updated_at, created_at')
    .eq('is_published', true)
    .limit(2000)

  const pages = (data ?? []) as Array<Pick<AgentPage, 'slug' | 'name' | 'website_url' | 'is_published' | 'updated_at' | 'created_at'>>
  const stale = pages
    .filter((p) => Boolean(p.website_url) && isStale(p, DEFAULT_STALE_DAYS))
    .map((p) => ({ slug: p.slug, name: p.name, days: daysSince(p.updated_at || p.created_at) }))
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0))

  return NextResponse.json({
    ok: true,
    checked: pages.length,
    threshold_days: DEFAULT_STALE_DAYS,
    stale_count: stale.length,
    stale: stale.slice(0, 100),
    ran_at: new Date().toISOString(),
  })
}
