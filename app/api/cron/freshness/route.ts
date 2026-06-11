import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { AgentPage, getOfferCount } from '../../../../lib/agent-page'
import { DEFAULT_STALE_DAYS, daysSince, isStale } from '../../../../lib/freshness'
import { analyzeSite } from '../../../../lib/importer'

// How many of the stalest pages to actually re-fetch + drift-check per run
// (bounded to keep the cron fast and polite — no blind overwrites).
const DRIFT_CHECK_LIMIT = 5

// This job re-fetches external sites; give it room so it isn't killed mid-run.
export const maxDuration = 60

/**
 * Scheduled freshness monitor (Vercel cron — see vercel.json).
 * Scans published pages and reports those that may have drifted from their
 * source site (stale + has website_url). Read-only telemetry today; the report
 * is the hook for future notifications (ties into the notifications feature).
 *
 * Protected: scheduled runs must send `Authorization: Bearer ${CRON_SECRET}`.
 * Local development may run without the secret; production never should.
 */
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
  const { data } = await admin
    .from('pages')
    .select('id, slug, name, website_url, is_published, updated_at, created_at, services, products')
    .eq('is_published', true)
    .limit(2000)

  const pages = (data ?? []) as Array<
    Pick<AgentPage, 'slug' | 'name' | 'website_url' | 'is_published' | 'updated_at' | 'created_at' | 'services' | 'products'>
  >
  const stale = pages
    .filter((p) => Boolean(p.website_url) && isStale(p, DEFAULT_STALE_DAYS))
    .map((p) => ({ page: p, days: daysSince(p.updated_at || p.created_at) ?? 0 }))
    .sort((a, b) => b.days - a.days)

  // Drift detection: re-fetch the stalest pages' source sites and compare offer
  // counts. Read-only — we never overwrite; we just report likely drift.
  const driftChecks = await Promise.all(
    stale.slice(0, DRIFT_CHECK_LIMIT).map(async ({ page, days }) => {
      const current = getOfferCount(page)
      try {
        const result = await analyzeSite(page.website_url as string)
        const found = result.structuredOffers?.length ?? 0
        return { slug: page.slug, name: page.name, days, current_offers: current, source_offers: found, drift_detected: found !== current }
      } catch {
        return { slug: page.slug, name: page.name, days, current_offers: current, source_offers: null, drift_detected: false, error: 'fetch_failed' }
      }
    }),
  )

  return NextResponse.json({
    ok: true,
    checked: pages.length,
    threshold_days: DEFAULT_STALE_DAYS,
    stale_count: stale.length,
    stale: stale.slice(0, 100).map(({ page, days }) => ({ slug: page.slug, name: page.name, days })),
    drift_checked: driftChecks.length,
    drift: driftChecks,
    ran_at: new Date().toISOString(),
  })
}
