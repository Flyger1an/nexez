export type ReviewOrderKind = 'checkout' | 'negotiation'

export type ReviewStatus = 'pending' | 'published' | 'hidden' | 'disputed' | 'removed'

export type ReviewRating = 1 | 2 | 3 | 4 | 5

export type ReviewTag = {
  label: string
  count: number
}

export type PublicReview = {
  id: string
  rating: ReviewRating
  title: string | null
  body: string | null
  tags: string[]
  createdAt: string
}

export type ReviewSummary = {
  average: number | null
  count: number
  verified_count: number
  reputation_score: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
  recent_positive_tags: ReviewTag[]
  recent_reviews: PublicReview[]
}

export type ReviewRow = {
  id: string
  rating: number
  title?: string | null
  body?: string | null
  tags?: unknown
  created_at?: string | null
}

const PLATFORM_PRIOR = 4.2
const MIN_REVIEWS = 5

export const REVIEW_TAG_OPTIONS = [
  'Clear communication',
  'Fast response',
  'Accurate listing',
  'Fair pricing',
  'Delivered on time',
  'Agent-friendly',
  'Would buy again',
] as const

export function emptyReviewSummary(): ReviewSummary {
  return {
    average: null,
    count: 0,
    verified_count: 0,
    reputation_score: 0,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    recent_positive_tags: [],
    recent_reviews: [],
  }
}

export function canReviewOrderStatus(status: string): boolean {
  const normalized = (status || '').toLowerCase()
  return normalized === 'paid' || normalized === 'complete' || normalized === 'dispute_won'
}

export function normalizeReviewTags(value: unknown, max = 6): string[] {
  const raw = Array.isArray(value) ? value : []
  const allowed = new Set<string>(REVIEW_TAG_OPTIONS)
  const clean: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const label = item.trim().slice(0, 40)
    if (!label || !allowed.has(label) || clean.includes(label)) continue
    clean.push(label)
    if (clean.length >= max) break
  }
  return clean
}

export function buildReviewSummary(rows: ReviewRow[], recentLimit = 3): ReviewSummary {
  if (!rows.length) return emptyReviewSummary()

  const distribution = emptyReviewSummary().distribution
  let total = 0
  const tagCounts = new Map<string, number>()
  const recentReviews: PublicReview[] = []

  const sorted = [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  for (const row of sorted) {
    const rating = clampRating(row.rating)
    distribution[String(rating) as keyof typeof distribution] += 1
    total += rating

    const tags = normalizeReviewTags(row.tags)
    if (rating >= 4) {
      for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }

    if (recentReviews.length < recentLimit) {
      recentReviews.push({
        id: row.id,
        rating,
        title: cleanPublicText(row.title, 120),
        body: cleanPublicText(row.body, 800),
        tags,
        createdAt: row.created_at || new Date(0).toISOString(),
      })
    }
  }

  const count = rows.length
  const average = roundOne(total / count)
  const reputation = ((average * count) + (PLATFORM_PRIOR * MIN_REVIEWS)) / (count + MIN_REVIEWS)
  const recentTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([label, tagCount]) => ({ label, count: tagCount }))

  return {
    average,
    count,
    verified_count: count,
    reputation_score: roundTwo(reputation),
    distribution,
    recent_positive_tags: recentTags,
    recent_reviews: recentReviews,
  }
}

function clampRating(value: number): ReviewRating {
  const rounded = Math.round(value)
  if (rounded <= 1) return 1
  if (rounded >= 5) return 5
  return rounded as ReviewRating
}

function cleanPublicText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.slice(0, max)
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10
}

function roundTwo(value: number) {
  return Math.round(value * 100) / 100
}
