import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { AgentPage, getOfferCount } from '../../../../lib/agent-page'
import { DEFAULT_STALE_DAYS, daysSince, freshnessLabel, isStale, staleNudgeDue } from '../../../../lib/freshness'
import { analyzeSite } from '../../../../lib/importer'
import { buildStaleListingEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { resolveOwnerNotifyEmail } from '../../../../lib/server/owner-email'
import { appUrl } from '../../../../lib/site'

// How many of the stalest pages to actually re-fetch + drift-check per run
// (bounded to keep the cron fast and polite - no blind overwrites).
const DRIFT_CHECK_LIMIT = 5

// Max re-interview nudge emails to send per run - polite pacing on the daily job.
const NUDGE_LIMIT = 10

type FreshnessPage = Pick<
  AgentPage,
  'slug' | 'name' | 'website_url' | 'is_published' | 'updated_at' | 'created_at' | 'services' | 'products'
> & { id: string; owner_id: string | null; contact_email: string | null }

// This job re-fetches external sites; give it room so it isn't killed mid-run.
export const maxDuration = 60

/**
 * Scheduled freshness monitor (Vercel cron - see vercel.json).
 * Scans published pages, reports those that may have drifted from their source
 * site (stale + has website_url), AND nudges the owner of each stale listing to
 * re-interview it - a SELLER-facet email (never the buyer notifications feed),
 * cooldown-gated per page so a page is nudged at most once per window.
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
    .select('id, owner_id, contact_email, slug, name, website_url, is_published, updated_at, created_at, services, products')
    .eq('is_published', true)
    .limit(2000)

  const pages = (data ?? []) as FreshnessPage[]
  const stale = pages
    .filter((p) => Boolean(p.website_url) && isStale(p, DEFAULT_STALE_DAYS))
    .map((p) => ({ page: p, days: daysSince(p.updated_at || p.created_at) ?? 0 }))
    .sort((a, b) => b.days - a.days)

  // Drift detection: re-fetch the stalest pages' source sites and compare offer
  // counts. Read-only - we never overwrite; we just report likely drift.
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

  // Re-interview nudge: turn staleness into an owner-facing prompt (closes the
  // loop with the re-interview feature). Seller-facet EMAIL only; cooldown-gated
  // via page_freshness_nudges so each page is nudged at most once per window.
  // Best-effort - a send/ledger failure is logged, never breaks this response.
  let nudged = 0
  const nudgeErrors: string[] = []
  if (hasEmailEnv() && stale.length) {
    const stalePageIds = stale.map(({ page }) => page.id)
    const { data: ledger } = await admin
      .from('page_freshness_nudges')
      .select('page_id, last_nudged_at, nudge_count')
      .in('page_id', stalePageIds)
    const byPage = new Map<string, { last_nudged_at: string; nudge_count: number }>(
      (ledger ?? []).map((r: { page_id: string; last_nudged_at: string; nudge_count: number }) => [r.page_id, r]),
    )
    const due = stale
      .filter(({ page }) => page.owner_id && staleNudgeDue(byPage.get(page.id)?.last_nudged_at))
      .slice(0, NUDGE_LIMIT)

    await Promise.all(
      due.map(async ({ page }) => {
        try {
          const to = await resolveOwnerNotifyEmail({ contactEmail: page.contact_email, ownerId: page.owner_id })
          if (!to) return
          const mail = await buildStaleListingEmail({
            businessName: page.name || page.slug,
            listingName: page.name || page.slug,
            freshnessLabel: freshnessLabel(page),
            reinterviewUrl: appUrl(`/create?reinterview=${page.id}`),
            editUrl: appUrl(`/dashboard/${page.id}`),
          })
          const res = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
          if (!res.ok) {
            nudgeErrors.push(page.slug)
            return
          }
          // Stamp the cooldown clock only after a successful send.
          const prior = byPage.get(page.id)?.nudge_count ?? 0
          await admin.from('page_freshness_nudges').upsert(
            { page_id: page.id, owner_id: page.owner_id, last_nudged_at: new Date().toISOString(), nudge_count: prior + 1 },
            { onConflict: 'page_id' },
          )
          nudged += 1
        } catch {
          nudgeErrors.push(page.slug)
        }
      }),
    )
  }

  return NextResponse.json({
    ok: true,
    checked: pages.length,
    threshold_days: DEFAULT_STALE_DAYS,
    stale_count: stale.length,
    stale: stale.slice(0, 100).map(({ page, days }) => ({ slug: page.slug, name: page.name, days })),
    drift_checked: driftChecks.length,
    drift: driftChecks,
    nudged,
    ...(nudgeErrors.length ? { nudge_errors: nudgeErrors } : {}),
    ran_at: new Date().toISOString(),
  })
}
