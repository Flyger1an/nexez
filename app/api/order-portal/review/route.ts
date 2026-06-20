import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { canReviewOrderStatus, normalizeReviewTags } from '../../../../lib/reviews'
import { resolveOrderForRequest } from '../../../../lib/server/load-order'
import { hashBuyerEmail } from '../../../../lib/server/reviews'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const MAX_TITLE = 120
const MAX_BODY = 2000

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'order-portal-review', 6, 60_000)
  if (limited) return limited

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Reviews are not available on this deployment.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    token?: string
    rating?: number | string
    title?: string
    body?: string
    tags?: unknown
  }

  const token = String(body.token || '').trim()
  const rating = Number(body.rating)
  const title = cleanText(body.title, MAX_TITLE)
  const reviewBody = cleanText(body.body, MAX_BODY)
  const tags = normalizeReviewTags(body.tags)

  if (!token) return NextResponse.json({ error: 'Missing order token.' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Choose a rating from 1 to 5.' }, { status: 400 })
  }
  if (rating <= 2 && !reviewBody) {
    return NextResponse.json({ error: 'Please add a short note for low ratings so the seller can understand what happened.' }, { status: 400 })
  }

  const target = await resolveOrderForRequest(token)
  if (!target) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (!target.ownerId) return NextResponse.json({ error: 'This order can’t accept reviews yet.' }, { status: 409 })
  if (!canReviewOrderStatus(target.status)) {
    return NextResponse.json({ error: 'This order is not eligible for a review yet.' }, { status: 409 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('order_reviews')
    .insert({
      order_kind: target.kind,
      order_id: target.orderId,
      owner_id: target.ownerId,
      page_id: target.pageId,
      slug: target.slug,
      offer_name: target.offerName,
      offer_key: target.offerKey,
      rating,
      title,
      body: reviewBody,
      tags,
      status: 'published',
      buyer_email_hash: hashBuyerEmail(target.buyerEmail),
      metadata: { source: 'order_portal' },
    })
    .select('id, rating, title, body, tags, status, created_at')
    .single<{ id: string; rating: number; title: string | null; body: string | null; tags: unknown; status: string; created_at: string }>()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'You already reviewed this order.' }, { status: 409 })
    }
    console.warn('[order-portal] review insert failed:', error.message)
    return NextResponse.json({ error: 'Could not save your review — please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    review: {
      id: data.id,
      rating: data.rating,
      title: data.title,
      body: data.body,
      tags: normalizeReviewTags(data.tags),
      status: data.status,
      createdAt: data.created_at,
    },
  })
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean ? clean.slice(0, max) : null
}
