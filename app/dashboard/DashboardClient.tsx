'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, Plus } from 'lucide-react'
import {
  AgentPage,
  BASIC_OWNER_PAGE_SELECT,
  OWNER_PAGE_SELECT,
  getBaseUrl,
  getOfferCount,
  getReadinessScore,
} from '../../lib/agent-page'
import { buildDuplicatePayload } from '../../lib/duplicate-page'
import { AgentVisit, getAgentTypeBreakdown, getTopPagesByAgentVisits, getTrafficSplit } from '../../lib/agent-visits'
import {
  getCheckoutAttemptCount,
  getCheckoutHandoffCount,
  getDiscoveryClickCount,
  isDryRunEvent,
} from '../../lib/analytics'
import { CheckoutEvent, getEventActionLabel } from '../../lib/checkout-events'
import { createClient } from '../../utils/supabase/client'
import { PendingInvitesBanner } from './PendingInvitesBanner'
import { PageCard } from '../../components/dashboard/PageCard'
import { OnboardingChecklist } from '../../components/OnboardingChecklist'
import { buildNotifications } from '../../lib/notifications'
import { agentRuntimeUrl } from '../../lib/site'
import { publishErrorMessage } from '../../lib/publish-error'
import type { SellerGrowthState } from '../../lib/server/seller-growth'
import type { OwnerAnalyticsRollup } from '../../lib/server/analytics-rollup'
import { SellerGrowthInvites } from '../../components/growth/SellerGrowthInvites'

export type DashboardInitial = {
  pages: AgentPage[]
  events: CheckoutEvent[]
  agentVisits: AgentVisit[]
  openNegotiations: number
  sharedPages: AgentPage[]
  displayName: string
  // Start-of-today (ISO), computed server-side from the same helper Analytics
  // uses, so the Overview headline and Analytics' "Today" range stay in sync.
  todayCutoff: string
  // An intake interview reached handed_off - counts toward the create step in
  // the onboarding checklist (intake spec §8).
  interviewCompleted?: boolean
  growthState?: SellerGrowthState
  analyticsRollup?: OwnerAnalyticsRollup | null
}

// Overview shows a bounded recent set; full management (with pagination) lives
// in /dashboard/listings so the dashboard stays fast for accounts with many pages.
const OVERVIEW_PAGE_LIMIT = 9

export function DashboardClient({ initial }: { initial?: DashboardInitial }) {
  const [pages, setPages] = useState<AgentPage[]>(initial?.pages ?? [])
  const [events, setEvents] = useState<CheckoutEvent[]>(initial?.events ?? [])
  const [agentVisits, setAgentVisits] = useState<AgentVisit[]>(initial?.agentVisits ?? [])
  const [openNegotiations, setOpenNegotiations] = useState(initial?.openNegotiations ?? 0)
  // Server pre-rendered with data → no loading flash. Refresh happens in the background.
  const [loading, setLoading] = useState(!initial)
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sharedPages, setSharedPages] = useState<AgentPage[]>(initial?.sharedPages ?? [])

  useEffect(() => {
    loadPages()
  }, [])

  const publishedCount = pages.filter((page) => page.is_published).length
  const averageReadiness = pages.length
    ? Math.round(pages.reduce((sum, page) => sum + getReadinessScore(page), 0) / pages.length)
    : 0
  const totalOffers = pages.reduce((sum, page) => sum + getOfferCount(page), 0)

  // The Overview headline + KPIs report TODAY's activity. We scope to the
  // server-provided start-of-today cutoff and reuse the Analytics helpers (which
  // exclude dry-run/simulation events) so the numbers match the Analytics
  // "Today" range exactly. `created_at` is compared as an absolute instant so
  // the window is identical regardless of where the filter runs.
  const cutoffMs = useMemo(() => {
    const ms = Date.parse(initial?.todayCutoff ?? '')
    if (!Number.isNaN(ms)) return ms
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return start.getTime()
  }, [initial?.todayCutoff])
  const todayEvents = useMemo(
    () => events.filter((e) => Date.parse(e.created_at) >= cutoffMs),
    [events, cutoffMs],
  )
  const todayVisits = useMemo(
    () => agentVisits.filter((v) => Date.parse(v.created_at) >= cutoffMs),
    [agentVisits, cutoffMs],
  )

  const sampledTrafficSplit = useMemo(() => getTrafficSplit(todayVisits), [todayVisits])
  const trafficSplit = initial?.analyticsRollup
    ? {
        ai: initial.analyticsRollup.counts.aiVisits,
        human: initial.analyticsRollup.counts.humanVisits,
        total: initial.analyticsRollup.counts.visits,
      }
    : sampledTrafficSplit
  const agentTypeBreakdown = useMemo(() => initial?.analyticsRollup
    ? initial.analyticsRollup.agentTypes.slice(0, 4).map((row) => ({
        agentType: row.agentType,
        total: row.visits,
        avgConfidence: row.avgConfidence,
      }))
    : getAgentTypeBreakdown(todayVisits).slice(0, 4), [initial?.analyticsRollup, todayVisits])
  const topAgentPages = useMemo(() => initial?.analyticsRollup
    ? initial.analyticsRollup.topPages.slice(0, 4).map((row) => ({
        pageId: row.pageId,
        slug: row.slug,
        name: row.name,
        total: row.visits,
      }))
    : getTopPagesByAgentVisits(todayVisits, pages).slice(0, 4), [initial?.analyticsRollup, todayVisits, pages])
  const totalTrackedSignals = initial?.analyticsRollup
    ? initial.analyticsRollup.counts.events + initial.analyticsRollup.counts.visits
    : todayEvents.filter((event) => !isDryRunEvent(event)).length + todayVisits.length
  const agentPageVisits = trafficSplit.ai
  const discoveryClicks = initial?.analyticsRollup?.counts.discoveryClicks
    ?? getDiscoveryClickCount(todayEvents)
  const checkoutAttempts = initial?.analyticsRollup?.counts.checkoutAttempts
    ?? getCheckoutAttemptCount(todayEvents)
  const checkoutHandoffs = initial?.analyticsRollup?.counts.checkoutHandoffs
    ?? getCheckoutHandoffCount(todayEvents)
  const topOffer = initial?.analyticsRollup?.topOffers[0]?.offerName ?? getTopOffer(todayEvents)
  const signalsByPageId = useMemo(() => {
    const counts = new Map<string, number>()

    for (const event of events) {
      counts.set(event.page_id, (counts.get(event.page_id) ?? 0) + 1)
    }

    for (const visit of agentVisits) {
      if (!visit.is_ai_agent) continue
      counts.set(visit.page_id, (counts.get(visit.page_id) ?? 0) + 1)
    }

    return counts
  }, [agentVisits, events])
  async function loadPages() {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const meta = (user.user_metadata ?? {}) as { full_name?: string; company?: string }
      setDisplayName(meta.full_name || meta.company || user.email || '')
    }

    if (!user) {
      window.location.href = '/login?next=/dashboard'
      return
    }

    // Fetch everything independent of each other in one parallel wave.
    const [pageResult, eventResult, visitResult, invitesResult, negotiationResult] = await Promise.all([
      fetchOwnedPages(supabase, user.id),
      supabase
        .from('checkout_events')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<CheckoutEvent[]>(),
      fetchAgentVisits(supabase, user.id),
      supabase.from('team_invites').select('owner_id').eq('email', (user.email ?? '').toLowerCase()).eq('status', 'accepted'),
      supabase
        .from('agent_negotiations')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .in('status', ['negotiation', 'agreement_proposed', 'held']),
    ])

    if (pageResult.error) {
      console.error('Failed to load pages:', pageResult.error)
      setPages([])
    } else {
      setPages(pageResult.data || [])
    }

    if (eventResult.error) {
      console.error('Failed to load events:', eventResult.error)
      setEvents([])
    } else {
      setEvents(eventResult.data || [])
    }

    if (visitResult.error) {
      if (!isMissingRelationError(visitResult.error)) {
        console.warn('Failed to load agent visits:', visitResult.error)
      }
      setAgentVisits([])
    } else {
      setAgentVisits(visitResult.data || [])
    }

    // Open negotiations (graceful if table missing).
    if (negotiationResult.error && !isMissingRelationError(negotiationResult.error)) {
      console.warn('Failed to count negotiations:', negotiationResult.error)
    }
    setOpenNegotiations(negotiationResult.error ? 0 : negotiationResult.count ?? 0)

    // Pages shared with me - one follow-up query keyed off the invites we already loaded.
    try {
      const ownerIds = [...new Set((invitesResult.data ?? []).map((i) => i.owner_id as string))].filter(
        (oid) => oid !== user.id,
      )
      if (ownerIds.length) {
        const { data: shared } = await supabase
          .from('pages')
          .select(BASIC_OWNER_PAGE_SELECT)
          .in('owner_id', ownerIds)
          .order('created_at', { ascending: false })
          .returns<AgentPage[]>()
        setSharedPages(shared ?? [])
      } else {
        setSharedPages([])
      }
    } catch {
      setSharedPages([])
    }

    setLoading(false)
  }

  async function togglePublished(id: string, currentStatus: boolean) {
    const supabase = createClient()
    // The published-page limit is enforced by a DB trigger; surface its message
    // (e.g. when a Free owner tries to publish past their limit) instead of
    // silently leaving the page unpublished.
    const { error } = await supabase.from('pages').update({ is_published: !currentStatus }).eq('id', id)
    if (error) {
      alert(publishErrorMessage(error))
      return
    }
    loadPages()
  }

  async function deletePage(id: string) {
    if (!confirm('Delete this listing?')) return

    const supabase = createClient()
    await supabase.from('pages').delete().eq('id', id)
    loadPages()
  }

  // Clone a page's content into a new unpublished draft (new slug, no domain).
  async function duplicatePage(page: AgentPage) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('pages')
      .insert(buildDuplicatePayload(page, user.id, pages.map((p) => p.slug)))

    if (error) {
      alert(`Could not duplicate this listing: ${error.message}`)
      return
    }
    loadPages()
  }

  async function copyUrl(slug: string) {
    await navigator.clipboard.writeText(`${getBaseUrl()}/${slug}`)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkSetPublished(published: boolean) {
    const supabase = createClient()
    // The DB trigger enforces the limit per row: rows that fit publish, the rest
    // are rejected. Surface the limit message if any row was rejected.
    const results = await Promise.all(
      [...selectedIds].map((id) => supabase.from('pages').update({ is_published: published }).eq('id', id)),
    )
    const firstError = results.map((r) => r.error).find(Boolean)
    setSelectedIds(new Set())
    if (firstError) alert(publishErrorMessage(firstError))
    loadPages()
  }

  function bulkExport() {
    const chosen = pages.filter((p) => selectedIds.has(p.id))
    const blob = new Blob([JSON.stringify(chosen, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nexez-pages-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-65px)] bg-background px-5 py-6 text-white md:px-8">
        <div className="mx-auto max-w-7xl rounded-lg border border-border bg-[var(--ov-03)] p-6">
          <p className="text-sm text-muted-foreground">Nexez dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Overview</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Loading your listings and agent signals. If this does not finish, sign in again to refresh your session.
          </p>
          <a href="/login?next=/dashboard" className="btn-secondary mt-5 h-10 px-4">Sign in</a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-white">
      <div className="mx-auto max-w-7xl px-5 py-6 md:px-8">
        <PendingInvitesBanner />
        <section className="rounded-lg border border-border bg-[var(--ov-03)] p-5 md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm text-muted-foreground">{displayName ? `Welcome back, ${displayName}` : 'Nexez dashboard'}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Overview</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Monitor your listings, traffic signals, readiness, and conversion actions from one place.
              </p>
            </div>
            <a href="/create" className="btn-primary h-10 px-4 text-sm">
              <Plus className="size-4" />
              New Listing
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <OverviewPill label="Published" value={publishedCount.toLocaleString()} />
            <OverviewPill label="Offers" value={totalOffers.toLocaleString()} />
            <OverviewPill label="Readiness" value={`${averageReadiness}%`} />
            <a
              href="/llms.txt"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 font-mono text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-white"
            >
              /llms.txt
            </a>
          </div>
        </section>
        <OnboardingChecklist pages={pages} interviewCompleted={initial?.interviewCompleted} />
        {initial?.growthState && <SellerGrowthInvites initialState={initial.growthState} />}
            {pages.length === 0 ? (
              <NewUserHero name={displayName} />
            ) : (
              <section className="overflow-hidden rounded-lg border border-[var(--bd-10)] bg-[var(--ov-04)]">
                <div className="relative p-6 md:p-8">
                  <div className="absolute right-8 top-8 hidden size-32 rounded-full bg-[var(--signal)]/25 blur-3xl md:block" />
                  {totalTrackedSignals === 0 ? (
                    <>
                      <p className="text-sm text-[var(--signal)]">Today on your listings</p>
                      <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                        {publishedCount > 0
                          ? `All quiet so far - your ${publishedCount} published listing${publishedCount === 1 ? '' : 's'} ${publishedCount === 1 ? 'is' : 'are'} live and crawlable.`
                          : 'Publish a listing to start appearing to AI agents.'}
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">
                        Agent discovery builds over time. {publishedCount > 0 ? 'Share your listing link and ' : 'Publish your first listing, then '}
                        connect Stripe to accept payments, or see how agents rank you in the{' '}
                        <a href="/simulator" className="text-[var(--signal)] hover:underline">Agent Lab</a>. History lives in{' '}
                        <a href="/dashboard/analytics" className="text-[var(--signal)] hover:underline">Analytics</a>.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[var(--signal)]">Today, your Nexez listings received</p>
                      <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                        {agentPageVisits} AI agent visits, {trafficSplit.human} human visits, {discoveryClicks} discovery clicks, and {checkoutHandoffs} checkout handoffs
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">
                        {totalTrackedSignals} tracked signals today across {publishedCount} published listings and {totalOffers} listed offers -
                        a live view of how AI agents are discovering and acting on your business. See full history in{' '}
                        <a href="/dashboard/analytics" className="text-[var(--signal)] hover:underline">Analytics</a>.
                      </p>
                      {topOffer ? (
                        <p className="mt-4 inline-flex rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/10 px-3 py-2 text-sm text-[var(--signal)]">
                          Top signal: {topOffer}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </section>
            )}

            {(() => {
              const notifications = buildNotifications({ pages, openNegotiations })
              if (!notifications.length) return null
              return (
                <div className="mt-6 space-y-2">
                  {notifications.map((n) => (
                    <a
                      key={n.id}
                      href={n.href}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-5 py-3 text-sm transition ${
                        n.severity === 'action'
                          ? 'border-[var(--amber)]/40 bg-[var(--amber)]/10 hover:bg-[var(--amber)]/20'
                          : 'border-[var(--bd-10)] bg-[var(--ov-03)] hover:bg-[var(--ov-05)]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Bell className={`size-4 ${n.severity === 'action' ? 'text-[var(--amber)]' : 'text-[var(--fg-muted)]'}`} />
                        <span className="text-white">{n.message}</span>
                      </span>
                      <span className={`shrink-0 text-sm font-medium ${n.severity === 'action' ? 'text-[var(--amber)]' : 'text-[var(--signal)]'}`}>{n.cta} →</span>
                    </a>
                  ))}
                </div>
              )
            })()}

            {pages.length > 0 && (
            <>
            <div className="mt-6 flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--signal)]">Today</h2>
              <a href="/dashboard/analytics?range=today" className="text-xs text-[var(--fg-muted)] hover:text-[var(--signal)]">
                View in Analytics →
              </a>
            </div>
            <section className="nx-rise-stagger mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="kpi-card">
                <p className="text-sm text-[var(--fg-muted)]">Tracked signals</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter">{totalTrackedSignals}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[var(--fg-muted)]">AI agent visits</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter text-[var(--ready)]">{agentPageVisits}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[var(--fg-muted)]">Discovery clicks</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter text-[var(--amber)]">{discoveryClicks}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[var(--fg-muted)]">Checkout attempts</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter">{checkoutAttempts}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[var(--fg-muted)]">Checkout handoffs</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter text-[var(--ready)]">{checkoutHandoffs}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[var(--fg-muted)]">Avg readiness</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter">{averageReadiness}%</p>
                <p className="mt-1 text-[11px] text-[var(--fg-muted-2)]">all listings</p>
              </div>
            </section>

            <AgentDetectionSummary trafficSplit={trafficSplit} breakdown={agentTypeBreakdown} topPages={topAgentPages} />

            <RecentActivity events={events} pages={pages} />
            </>
            )}

            {selectedIds.size > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-4 py-3 text-sm">
                <span className="font-medium text-white">{selectedIds.size} selected</span>
                <button onClick={() => bulkSetPublished(true)} className="rounded border border-[var(--ready)]/40 px-3 py-1 text-xs text-[var(--ready)] hover:bg-[var(--ready)]/10">Publish</button>
                <button onClick={() => bulkSetPublished(false)} className="rounded border border-white/20 px-3 py-1 text-xs text-[var(--fg)] hover:bg-[var(--ov-05)]">Unpublish</button>
                <button onClick={bulkExport} className="rounded border border-[var(--signal)]/40 px-3 py-1 text-xs text-[var(--signal)] hover:bg-[var(--signal)]/10">Export JSON</button>
                <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-[var(--fg-muted)] hover:text-white">Clear</button>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Listings</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{pages.length} total</span>
                {pages.length > OVERVIEW_PAGE_LIMIT ? (
                  <a href="/dashboard/listings" className="text-xs text-[var(--signal)] hover:underline">Manage all →</a>
                ) : null}
              </div>
            </div>

            <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pages.slice(0, OVERVIEW_PAGE_LIMIT).map((page) => (
                <PageCard
                  key={page.id}
                  page={page}
                  eventCount={signalsByPageId.get(page.id) ?? 0}
                  onCopy={() => copyUrl(page.slug)}
                  onDelete={() => deletePage(page.id)}
                  onDuplicate={() => duplicatePage(page)}
                  onToggle={() => togglePublished(page.id, page.is_published)}
                  selected={selectedIds.has(page.id)}
                  onSelectToggle={() => toggleSelect(page.id)}
                />
              ))}
            </section>

            {pages.length > OVERVIEW_PAGE_LIMIT ? (
              <div className="mt-4 text-center">
                <a href="/dashboard/listings" className="btn-secondary inline-flex h-10 px-4 text-sm">
                  Manage all {pages.length} listings →
                </a>
              </div>
            ) : null}

            {!pages.length ? (
              <div className="mt-5 rounded-lg border border-dashed border-[var(--bd-15)] p-12 text-center">
                <p className="text-[var(--fg-muted)]">No listings yet - create your first listing to start showing up for AI agents.</p>
              </div>
            ) : null}

            {sharedPages.length > 0 && (
              <div className="mt-10">
                <h2 className="text-lg font-semibold text-[var(--signal)]">Shared with me</h2>
                <p className="mt-1 text-xs text-[var(--fg-muted-2)]">Listings your teammates have shared with you.</p>
                <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sharedPages.map((sp) => (
                    <div key={sp.id} className="card !p-5">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-medium text-white">{sp.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${sp.is_published ? 'badge-published' : 'badge-draft'}`}>
                          {sp.is_published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{getOfferCount(sp)} offers · readiness {getReadinessScore(sp)}</p>
                      <div className="mt-3 flex gap-2 text-xs">
                        <a href={`/dashboard/${sp.id}`} className="rounded border border-[var(--signal)]/40 px-3 py-1 text-[var(--signal)] hover:bg-[var(--signal)]/10">Open</a>
                        <a href={agentRuntimeUrl(`/${sp.slug}`)} target="_blank" rel="noreferrer" className="rounded border border-[var(--bd-15)] px-3 py-1 text-[var(--fg)] hover:bg-[var(--ov-05)]">Public ↗</a>
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            )}
      </div>
    </main>
  )
}

async function fetchOwnedPages(supabase: ReturnType<typeof createClient>, ownerId: string) {
  const result = await supabase
    .from('pages')
    .select(OWNER_PAGE_SELECT)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  if (!result.error || !isMissingColumnError(result.error)) {
    return result
  }

  return supabase
    .from('pages')
    .select(BASIC_OWNER_PAGE_SELECT)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()
}

function fetchAgentVisits(supabase: ReturnType<typeof createClient>, ownerId: string) {
  return supabase
    .from('agent_visits')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(250)
    .returns<AgentVisit[]>()
}

function isMissingColumnError(error: { code?: string; message?: string }) {
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(error.message ?? '')
}

function OverviewPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-black/25 px-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-white">{value}</span>
    </div>
  )
}

function NewUserHero({ name }: { name: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--signal)]/30 bg-gradient-to-br from-[var(--signal)]/15 to-[var(--ready)]/5 p-7 md:p-10">
      <p className="text-sm text-[var(--signal)]">{name ? `Welcome, ${name}` : 'Welcome to Nexez'}</p>
      <h2 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight tracking-tight">
        Publish your first agent-readable page.
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
        Paste your existing website and we’ll turn it into an agent-readable page in seconds - or start
        from an industry template. Then publish it and (optionally) host it on your own custom domain.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href="/create"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--signal)] to-[var(--ready)] px-6 font-medium text-[#0A0A0F] transition hover:opacity-90"
        >
          <Plus className="size-4" /> Import your site
        </a>
        <a
          href="/create"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-[var(--bd-15)] px-6 text-sm font-medium text-white transition hover:bg-[var(--ov-05)]"
        >
          Start from a template
        </a>
        <a
          href="/simulator"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-[var(--bd-10)] px-6 text-sm text-zinc-300 transition hover:bg-[var(--ov-05)]"
        >
          Open the Agent Lab
        </a>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 text-sm text-[var(--fg-muted)] sm:grid-cols-3">
        <span>✓ JSON-LD, llms.txt, agent.json & MCP</span>
        <span>✓ Crawlable by AI bots</span>
        <span>✓ Custom domain ready</span>
      </div>
    </section>
  )
}

function AgentDetectionSummary({
  trafficSplit,
  breakdown,
  topPages,
}: {
  trafficSplit: ReturnType<typeof getTrafficSplit>
  breakdown: ReturnType<typeof getAgentTypeBreakdown>
  topPages: ReturnType<typeof getTopPagesByAgentVisits>
}) {
  const aiShare = trafficSplit.total ? Math.round((trafficSplit.ai / trafficSplit.total) * 100) : 0
  const humanShare = trafficSplit.total ? Math.round((trafficSplit.human / trafficSplit.total) * 100) : 0

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-[0.8fr_1fr_1fr]">
      <div className="rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/10 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--signal)]">AI detection</p>
        <h2 className="mt-2 text-xl font-semibold">Traffic split</h2>
        <div className="mt-5 overflow-hidden rounded-full border border-[var(--bd-10)] bg-black/30">
          <div className="h-3 bg-gradient-to-r from-[var(--ready)] to-[var(--signal)]" style={{ width: `${aiShare}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[var(--fg-muted-2)]">AI agents</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--signal)]">{trafficSplit.ai}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{aiShare}% of visits</p>
          </div>
          <div>
            <p className="text-[var(--fg-muted-2)]">Human/unknown</p>
            <p className="mt-1 text-2xl font-semibold text-white">{trafficSplit.human}</p>
            <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{humanShare}% of visits</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--bd-10)] bg-[var(--ov-04)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--signal)]">Agent types</p>
        <h2 className="mt-2 text-xl font-semibold">Who is parsing you</h2>
        <div className="mt-4 space-y-3">
          {breakdown.length ? (
            breakdown.map((row) => (
              <div key={row.agentType} className="rounded-lg border border-[var(--bd-10)] bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--fg)]">{row.agentType}</span>
                  <span className="font-mono text-[var(--signal)]">{row.total}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--fg-muted-2)]">{Math.round(row.avgConfidence)}% avg confidence</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--bd-10)] p-4 text-sm text-[var(--fg-muted-2)]">
              No AI agent visits classified yet.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--bd-10)] bg-[var(--ov-04)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--ready)]">Top listings</p>
        <h2 className="mt-2 text-xl font-semibold">Most agent-readable</h2>
        <div className="mt-4 space-y-3">
          {topPages.length ? (
            topPages.map((page) => (
              <a
                key={page.pageId}
                href={`/dashboard/analytics?page=${encodeURIComponent(page.pageId)}&traffic=ai`}
                className="block rounded-lg border border-[var(--bd-10)] bg-black/20 px-3 py-2 hover:border-[var(--signal)]/40"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="line-clamp-1 text-[var(--fg)]">{page.name}</span>
                  <span className="font-mono text-[var(--ready)]">{page.total}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--signal)]">/{page.slug}</p>
              </a>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--bd-10)] p-4 text-sm text-[var(--fg-muted-2)]">
              Publish a listing; crawlers populate this.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}


function RecentActivity({ events, pages }: { events: CheckoutEvent[]; pages: AgentPage[] }) {
  const firstPage = pages[0]

  return (
    <section className="mt-5 rounded-lg border border-[var(--bd-10)] bg-[var(--ov-04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--bd-10)] p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--signal)]">Agent activity</p>
          <h2 className="mt-1 text-xl font-semibold">Recent discovery + checkout signals</h2>
        </div>
        <a href="/dashboard/analytics" className="text-sm text-[var(--fg-muted)] hover:text-[var(--signal)]">
          View analytics
        </a>
      </div>

      {events.length ? (
        <div className="grid divide-y divide-white/10">
          {events.slice(0, 5).map((event) => (
            <div key={event.id} className="grid gap-3 p-5 md:grid-cols-[1.1fr_1fr_0.8fr_0.65fr] md:items-center">
              <div>
                <p className="font-medium text-white">{getEventActionLabel(event.event_type)}</p>
                <p className="mt-1 line-clamp-1 text-sm text-[var(--fg-muted-2)]">{formatAgentName(event.agent_user_agent)}</p>
              </div>
              <div>
                <p className="line-clamp-1 text-sm text-zinc-300">{event.offer_name}</p>
                <p className="mt-1 font-mono text-xs text-[var(--signal)]">/{event.slug}</p>
              </div>
              <p className="line-clamp-1 text-sm text-[var(--fg-muted)]">
                {event.query || event.referrer || 'No query context'}
              </p>
              <p className="text-sm text-[var(--fg-muted-2)] md:text-right">{formatEventTime(event.created_at)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">
            No discovery or checkout activity yet. Share the marketplace, run the agent tester, or open a public
            checkout path to start collecting useful intent signals.
          </p>
          <a
            href={firstPage ? `/dashboard/${firstPage.id}/test` : '/create'}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--signal)] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[var(--signal)]"
          >
            {firstPage ? 'Test a listing' : 'Create a listing'}
          </a>
        </div>
      )}
    </section>
  )
}

function getTopOffer(events: CheckoutEvent[]) {
  const counts = new Map<string, number>()

  for (const event of events) {
    counts.set(event.offer_name, (counts.get(event.offer_name) ?? 0) + 1)
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function formatAgentName(userAgent: string | null) {
  if (!userAgent) return 'Unknown agent'
  if (userAgent.length <= 80) return userAgent
  return `${userAgent.slice(0, 77)}...`
}

function formatEventTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Recently'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date)
}
