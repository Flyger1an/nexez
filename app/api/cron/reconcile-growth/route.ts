import { NextResponse } from 'next/server'
import { getPlanLimits } from '../../../../lib/billing'
import { buildPromotionExpiryEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { getOwnerPlanId } from '../../../../lib/server/plan'
import { resolveOwnerNotifyEmail } from '../../../../lib/server/owner-email'
import { appUrl } from '../../../../lib/site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const maxDuration = 60

const NOTICE_DAYS = new Set([30, 14, 7, 1])
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const BATCH_LIMIT = 500

type GrantRow = {
  id: string
  campaign_id: string
  owner_id: string
  plan_id: string
  ends_at: string
  fallback_page_id: string | null
}

type PageRow = {
  id: string
  owner_id: string
  name: string | null
  slug: string | null
  is_published: boolean
  created_at: string
}

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') return 'not_configured'
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return 'unauthorized'
  return 'ok'
}

export async function GET(request: Request) {
  const auth = cronAuthorized(request)
  if (auth === 'not_configured') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (auth === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const errors: string[] = []

  // Close stale pending invitations so their sender gets the slot back.
  const { data: staleInvites } = await admin
    .from('seller_growth_invites')
    .select('id, campaign_id, inviter_owner_id')
    .eq('status', 'pending')
    .lte('expires_at', nowIso)
    .limit(BATCH_LIMIT)
  const staleInviteRows = staleInvites ?? []
  let invitesExpired = 0
  if (staleInviteRows.length) {
    const ids = staleInviteRows.map((invite: { id: string }) => invite.id)
    const { data: expiredRows, error } = await admin
      .from('seller_growth_invites')
      .update({ status: 'expired' })
      .in('id', ids)
      .eq('status', 'pending')
      .select('id')
    if (error) {
      errors.push('invite_expiry')
    } else {
      invitesExpired = expiredRows?.length ?? 0
      if (expiredRows?.length) {
        const expiredIds = new Set(expiredRows.map((row: { id: string }) => row.id))
        await admin.from('seller_growth_events').insert(
          staleInviteRows
            .filter((row: { id: string }) => expiredIds.has(row.id))
            .map((row: { id: string; campaign_id: string; inviter_owner_id: string }) => ({
              campaign_id: row.campaign_id,
              owner_id: row.inviter_owner_id,
              invite_id: row.id,
              event_type: 'invite_expired',
            })),
        )
      }
    }
  }

  const noticeHorizon = new Date(now.getTime() + 31 * DAY_MS).toISOString()
  const [{ data: noticeGrants }, { data: endedGrants }] = await Promise.all([
    admin
      .from('promotional_plan_grants')
      .select('id, campaign_id, owner_id, plan_id, ends_at, fallback_page_id')
      .eq('status', 'active')
      .gt('ends_at', nowIso)
      .lte('ends_at', noticeHorizon)
      .order('ends_at', { ascending: true })
      .limit(BATCH_LIMIT)
      .returns<GrantRow[]>(),
    admin
      .from('promotional_plan_grants')
      .select('id, campaign_id, owner_id, plan_id, ends_at, fallback_page_id')
      .eq('status', 'active')
      .lte('ends_at', nowIso)
      .order('ends_at', { ascending: true })
      .limit(BATCH_LIMIT)
      .returns<GrantRow[]>(),
  ])

  const allGrants = [...(noticeGrants ?? []), ...(endedGrants ?? [])]
  const ownerIds = [...new Set(allGrants.map((grant) => grant.owner_id))]
  const ownerPagesRes = ownerIds.length
    ? await admin
        .from('pages')
        .select('id, owner_id, name, slug, is_published, created_at')
        .in('owner_id', ownerIds)
        .order('created_at', { ascending: true })
        .returns<PageRow[]>()
    : { data: [] as PageRow[] }
  const ownerPages = ownerPagesRes.data
  const pagesByOwner = new Map<string, PageRow[]>()
  for (const page of ownerPages ?? []) {
    const current = pagesByOwner.get(page.owner_id) ?? []
    current.push(page)
    pagesByOwner.set(page.owner_id, current)
  }

  let noticesSent = 0
  if (hasEmailEnv()) {
    for (const grant of noticeGrants ?? []) {
      const daysBefore = Math.ceil((Date.parse(grant.ends_at) - now.getTime()) / DAY_MS)
      if (!NOTICE_DAYS.has(daysBefore)) continue

      // Insert-first makes this an atomic delivery claim across concurrent cron runs.
      // On delivery failure the row is removed so the next hourly pass can retry.
      const { error: claimError } = await admin
        .from('promotional_grant_notices')
        .insert({ grant_id: grant.id, days_before: daysBefore })
      if (claimError) {
        if (claimError.code !== '23505') errors.push(`notice_claim:${grant.id}`)
        continue
      }

      const pages = pagesByOwner.get(grant.owner_id) ?? []
      const published = pages.filter((page) => page.is_published)
      const fallback =
        published.find((page) => page.id === grant.fallback_page_id)
        ?? published[0]
        ?? pages[0]
        ?? null
      const to = await resolveOwnerNotifyEmail({ ownerId: grant.owner_id, contactEmail: null })
      if (!to) {
        await admin
          .from('promotional_grant_notices')
          .delete()
          .eq('grant_id', grant.id)
          .eq('days_before', daysBefore)
        continue
      }

      const businessName = pages[0]?.name || pages[0]?.slug || 'Your business'
      const mail = await buildPromotionExpiryEmail({
        businessName,
        daysBefore,
        endsAt: grant.ends_at,
        fallbackListingName: fallback?.name || fallback?.slug || null,
        billingUrl: appUrl('/dashboard/billing'),
      })
      const sent = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
      if (sent.ok) {
        noticesSent += 1
      } else {
        await admin
          .from('promotional_grant_notices')
          .delete()
          .eq('grant_id', grant.id)
          .eq('days_before', daysBefore)
        errors.push(`notice_send:${grant.id}`)
      }
    }
  }

  let grantsExpired = 0
  let fallbackListingsApplied = 0
  for (const grant of endedGrants ?? []) {
    try {
      // Because ends_at is already in the past, the resolver ignores this grant
      // even before its status stamp changes. That lets us determine the true
      // underlying entitlement while keeping this row retryable until cleanup ends.
      const underlyingPlan = await getOwnerPlanId(admin, grant.owner_id)
      const pages = pagesByOwner.get(grant.owner_id) ?? []
      const published = pages.filter((page) => page.is_published)
      let fallback: PageRow | null = null

      if (underlyingPlan === 'free' && published.length > 0) {
        fallback =
          published.find((page) => page.id === grant.fallback_page_id)
          ?? published[0]
        if (published.length > getPlanLimits('free').publishedListings) fallbackListingsApplied += 1
      }

      // The grant status write invokes the canonical database reconciler in the
      // same transaction. It owns the exact plan allocation and the concurrency
      // locks; this cron only records the preferred Free fallback before expiry.
      const { data: expired, error } = await admin
        .from('promotional_plan_grants')
        .update({
          status: 'expired',
          ...(fallback ? { fallback_page_id: fallback.id } : {}),
        })
        .eq('id', grant.id)
        .eq('status', 'active')
        .lte('ends_at', nowIso)
        .select('id')
        .maybeSingle<{ id: string }>()
      if (error || !expired) continue

      grantsExpired += 1
      await admin.from('seller_growth_events').insert({
        campaign_id: grant.campaign_id,
        owner_id: grant.owner_id,
        grant_id: grant.id,
        event_type: 'grant_expired',
        metadata: { underlying_plan: underlyingPlan },
      })
      if (fallback) {
        await admin.from('seller_growth_events').insert({
          campaign_id: grant.campaign_id,
          owner_id: grant.owner_id,
          grant_id: grant.id,
          event_type: 'fallback_applied',
          metadata: {
            fallback_page_id: fallback.id,
            canonical_limit: getPlanLimits('free').publishedListings,
            unpublished_count: Math.max(0, published.length - getPlanLimits('free').publishedListings),
          },
        })
      }
    } catch {
      errors.push(`grant_expiry:${grant.id}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    invitesExpired,
    noticesSent,
    grantsExpired,
    fallbackListingsApplied,
    scanned: {
      notices: noticeGrants?.length ?? 0,
      endedGrants: endedGrants?.length ?? 0,
    },
    ...(errors.length ? { errors } : {}),
    ranAt: nowIso,
    nextWindowAt: new Date(now.getTime() + HOUR_MS).toISOString(),
  })
}
