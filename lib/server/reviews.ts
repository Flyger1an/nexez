import 'server-only'
import { createHash } from 'crypto'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { buildReviewSummary, emptyReviewSummary, type ReviewRow, type ReviewSummary } from '../reviews'

type ReviewDbRow = ReviewRow & { slug: string | null }

export function hashBuyerEmail(email: string | null): string | null {
  const clean = (email || '').trim().toLowerCase()
  if (!clean) return null
  const secret = process.env.REVIEW_HASH_SECRET || process.env.ORDER_LOOKUP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return createHash('sha256').update(`nexez-review-v1:${secret}:${clean}`).digest('hex')
}

export async function loadReviewSummaryForSlug(slug: string, recentLimit = 3): Promise<ReviewSummary> {
  const clean = (slug || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return emptyReviewSummary()
  const { data } = await createAdminClient()
    .from('order_reviews')
    .select('id, rating, title, body, tags, created_at')
    .eq('slug', clean)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<ReviewRow[]>()
  return buildReviewSummary(data ?? [], recentLimit)
}

export async function loadReviewSummariesForSlugs(slugs: string[], recentLimit = 0): Promise<Map<string, ReviewSummary>> {
  const clean = Array.from(new Set(slugs.map((slug) => (slug || '').trim()).filter(Boolean)))
  const result = new Map<string, ReviewSummary>()
  if (!clean.length || !hasSupabaseAdminEnv()) return result

  const admin = createAdminClient()
  const rows: ReviewDbRow[] = []
  for (let index = 0; index < clean.length; index += 200) {
    const batch = clean.slice(index, index + 200)
    const { data } = await admin
      .from('order_reviews')
      .select('id, slug, rating, title, body, tags, created_at')
      .in('slug', batch)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(Math.max(500, batch.length * 50))
      .returns<ReviewDbRow[]>()
    rows.push(...(data ?? []))
  }

  const bySlug = new Map<string, ReviewRow[]>()
  for (const row of rows) {
    if (!row.slug) continue
    const rows = bySlug.get(row.slug) ?? []
    rows.push(row)
    bySlug.set(row.slug, rows)
  }

  for (const [slug, rows] of bySlug) result.set(slug, buildReviewSummary(rows, recentLimit))
  return result
}
