import { NextResponse } from 'next/server'
import { getPlanLimits } from '../../../../lib/billing'
import {
  buildLaunchAccessStartedEmail,
  buildPromotionExpiryEmail,
  buildPublishNudgeEmail,
  hasEmailEnv,
  sendEmail,
} from '../../../../lib/email'
import { getOwnerPlanId } from '../../../../lib/server/plan'
import { resolveOwnerNotifyEmail } from '../../../../lib/server/owner-email'
import { sendOnceSystemEmail } from '../../../../lib/server/system-email'
import { appUrl } from '../../../../lib/site'
import { describeGrantDuration } from '../../../../lib/growth-duration'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const maxDuration = 60

const NOTICE_DAYS = new Set([30, 14, 7, 1])
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const BATCH_LIMIT = 500
const NOTIFICATION_BATCH_LIMIT = 50

// A spot that has been claimed but never published is the campaign's main drop-off.
// Three days is long enough that the nudge is not chasing someone who is mid-setup,
// and short enough to land while they still remember signing up.
const PUBLISH_NUDGE_AFTER_MS = 72 * HOUR_MS

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

type StartedGrantRow = {
  id: string
  campaign_id: string
  owner_id: string
  ends_at: string
  entitlement_activated_at: string | null
}

type ClaimedInviteRow = {
  id: string
  campaign_id: string
  accepted_by_owner_id: string
  accepted_at: string | null
}

type CampaignRow = {
  id: string
  grant_duration_days: number
  signup_closes_at: string | null
}

// The listing that earned the grant. The database mints it on the write that first
// publishes something, so the oldest published page is that listing in every path
// except a rare same-second double publish, where either name is honest.
function startingListingName(pages: PageRow[]): string {
  const published = pages.filter((page) => page.is_published)
  const first = published[0] ?? pages[0] ?? null
  return first?.name || first?.slug || 'Your first listing'
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

  // ── A grant just started: tell the owner ────────────────────────────────────
  //
  // The grant is minted inside a database trigger on the write that publishes a
  // first listing. A dashboard save, a Shopify install and a webhook all reach that
  // trigger, and none of them has a place to hang an email off, so this pass is the
  // only notification path. Delivery is claimed through sent_system_emails, which
  // rolls its claim back on a send failure, so a bad hour retries on the next run.
  let startNoticesSent = 0
  let publishNudgesSent = 0
  let startNoticesPending = 0
  let publishNudgesPending = 0

  if (hasEmailEnv()) {
    const { data: startedGrants } = await admin
      .from('promotional_plan_grants')
      .select('id, campaign_id, owner_id, ends_at, entitlement_activated_at')
      .eq('status', 'active')
      .not('entitlement_activated_at', 'is', null)
      .lte('starts_at', nowIso)
      .gt('ends_at', nowIso)
      // Newest first prevents long-lived, already-notified grants from occupying
      // the whole candidate window and starving a grant minted this hour.
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_BATCH_LIMIT)
      .returns<StartedGrantRow[]>()

    const startCandidates = startedGrants ?? []
    let startPending: StartedGrantRow[] = []
    if (startCandidates.length) {
      // Filter to the ones not yet told. Without this the pass re-claims a row per
      // live grant every hour for six months and eats a 23505 each time.
      const { data: alreadyTold } = await admin
        .from('sent_system_emails')
        .select('owner_id, kind')
        .in('owner_id', [...new Set(startCandidates.map((grant) => grant.owner_id))])
        .like('kind', 'growth_grant_started:%')
        .returns<{ owner_id: string; kind: string }[]>()
      const told = new Set((alreadyTold ?? []).map((row) => `${row.owner_id}|${row.kind}`))
      startPending = startCandidates.filter(
        (grant) => !told.has(`${grant.owner_id}|growth_grant_started:${grant.campaign_id}`),
      )
    }
    startNoticesPending = startPending.length

    // ── A spot is claimed but nothing is published ────────────────────────────
    //
    // An invite sits at 'claimed' precisely while no grant exists; the database
    // moves it to 'qualified' in the same statement that mints one. So this query
    // is the reserved-but-not-started set by construction, not by inference.
    const nudgeCutoff = new Date(now.getTime() - PUBLISH_NUDGE_AFTER_MS).toISOString()
    const { data: stalledInvites } = await admin
      .from('seller_growth_invites')
      .select('id, campaign_id, accepted_by_owner_id, accepted_at')
      .eq('status', 'claimed')
      .not('accepted_by_owner_id', 'is', null)
      .lte('accepted_at', nudgeCutoff)
      // Claimed invites remain claimed after the one nudge. Newest eligible first
      // prevents those older sent rows from permanently filling the window.
      .order('accepted_at', { ascending: false })
      .limit(NOTIFICATION_BATCH_LIMIT)
      .returns<ClaimedInviteRow[]>()

    const nudgeCandidates = stalledInvites ?? []
    let nudgePending: ClaimedInviteRow[] = []
    if (nudgeCandidates.length) {
      const { data: alreadyNudged } = await admin
        .from('sent_system_emails')
        .select('owner_id, kind')
        .in('owner_id', [...new Set(nudgeCandidates.map((invite) => invite.accepted_by_owner_id))])
        .like('kind', 'growth_publish_nudge:%')
        .returns<{ owner_id: string; kind: string }[]>()
      const nudged = new Set((alreadyNudged ?? []).map((row) => `${row.owner_id}|${row.kind}`))
      nudgePending = nudgeCandidates.filter(
        (invite) => !nudged.has(`${invite.accepted_by_owner_id}|growth_publish_nudge:${invite.campaign_id}`),
      )
    }

    // One page read and one campaign read for both passes.
    const noticeOwnerIds = [
      ...new Set([
        ...startPending.map((grant) => grant.owner_id),
        ...nudgePending.map((invite) => invite.accepted_by_owner_id),
      ]),
    ]
    const noticeCampaignIds = [
      ...new Set([
        ...startPending.map((grant) => grant.campaign_id),
        ...nudgePending.map((invite) => invite.campaign_id),
      ]),
    ]

    if (noticeOwnerIds.length) {
      const [noticePagesRes, noticeCampaignsRes] = await Promise.all([
        admin
          .from('pages')
          .select('id, owner_id, name, slug, is_published, created_at')
          .in('owner_id', noticeOwnerIds)
          .order('created_at', { ascending: true })
          .returns<PageRow[]>(),
        admin
          .from('seller_growth_campaigns')
          .select('id, grant_duration_days, signup_closes_at')
          .in('id', noticeCampaignIds)
          .returns<CampaignRow[]>(),
      ])
      const noticePagesByOwner = new Map<string, PageRow[]>()
      for (const page of noticePagesRes.data ?? []) {
        const current = noticePagesByOwner.get(page.owner_id) ?? []
        current.push(page)
        noticePagesByOwner.set(page.owner_id, current)
      }
      const campaignsById = new Map((noticeCampaignsRes.data ?? []).map((row) => [row.id, row]))

      for (const grant of startPending) {
        const campaign = campaignsById.get(grant.campaign_id)
        if (!campaign) continue
        const to = await resolveOwnerNotifyEmail({ ownerId: grant.owner_id, contactEmail: null })
        if (!to) continue
        const pages = noticePagesByOwner.get(grant.owner_id) ?? []
        const businessName = pages[0]?.name || pages[0]?.slug || 'Your business'
        const result = await sendOnceSystemEmail({
          ownerId: grant.owner_id,
          kind: `growth_grant_started:${grant.campaign_id}`,
          to,
          build: () => buildLaunchAccessStartedEmail({
            businessName,
            listingName: startingListingName(pages),
            durationLabel: describeGrantDuration(campaign.grant_duration_days),
            endsAt: grant.ends_at,
            dashboardUrl: appUrl('/dashboard'),
          }),
        })
        if (result.sent) startNoticesSent += 1
        else if (!result.skipped) errors.push(`grant_start_notice:${grant.id}`)
      }

      for (const invite of nudgePending) {
        const campaign = campaignsById.get(invite.campaign_id)
        if (!campaign) continue
        const pages = noticePagesByOwner.get(invite.accepted_by_owner_id) ?? []
        // A published listing with no grant is a different problem (unverified
        // business identity, or a campaign that filled) and "finish your listing"
        // would be the wrong instruction, so those are left for the dashboard.
        if (pages.some((page) => page.is_published)) continue
        publishNudgesPending += 1
        const to = await resolveOwnerNotifyEmail({ ownerId: invite.accepted_by_owner_id, contactEmail: null })
        if (!to) continue
        const businessName = pages[0]?.name || pages[0]?.slug || 'Your business'
        const result = await sendOnceSystemEmail({
          ownerId: invite.accepted_by_owner_id,
          kind: `growth_publish_nudge:${invite.campaign_id}`,
          to,
          build: () => buildPublishNudgeEmail({
            businessName,
            durationLabel: describeGrantDuration(campaign.grant_duration_days),
            reservedUntil: campaign.signup_closes_at,
            publishUrl: appUrl('/dashboard'),
          }),
        })
        if (result.sent) publishNudgesSent += 1
        else if (!result.skipped) errors.push(`publish_nudge:${invite.id}`)
      }
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    invitesExpired,
    noticesSent,
    startNoticesSent,
    publishNudgesSent,
    grantsExpired,
    fallbackListingsApplied,
    scanned: {
      notices: noticeGrants?.length ?? 0,
      endedGrants: endedGrants?.length ?? 0,
      startNotices: startNoticesPending,
      publishNudges: publishNudgesPending,
    },
    ...(errors.length ? { errors } : {}),
    ranAt: nowIso,
    nextWindowAt: new Date(now.getTime() + HOUR_MS).toISOString(),
  })
}
