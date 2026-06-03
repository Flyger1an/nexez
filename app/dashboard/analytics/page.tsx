import { ArrowLeft, ArrowUpRight, Bot, Download, Filter, Search } from 'lucide-react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'
import { TrafficChart } from './TrafficChart'
import { TopOffersChart } from './TopOffersChart'
import { ConversionFunnel } from './ConversionFunnel'
import { TopPagesChart } from './TopPagesChart'
import {
  AgentPage,
  BASIC_OWNER_PAGE_SELECT,
  OWNER_PAGE_SELECT,
  getOfferCount,
  getReadinessScore,
} from '../../../lib/agent-page'
import {
  AgentVisit,
  AgentVisitTrafficFilter,
  filterAgentVisits,
  getAgentTypeBreakdown,
  getReadinessTrendSummary,
  getTopPagesByAgentVisits,
  getTrafficSplit,
} from '../../../lib/agent-visits'
import {
  filterAnalyticsEvents,
  formatEventDate,
  getAgentName,
  getCheckoutAttemptCount,
  getConversionCount,
  getDailyEventSeries,
  getDiscoveryActionStats,
  getDiscoveryClickCount,
  getDiscoverySurfaceStats,
  getPageOptions,
  getPipelineCents,
  getRevenueCents,
  getAgentDrivenRevenueCents,
  getSignalLabel,
  getTopOfferStats,
} from '../../../lib/analytics'
import { formatUsdCents } from '../../../lib/checkout'
import { CheckoutEvent, getEventActionLabel } from '../../../lib/checkout-events'
import { createClient } from '../../../utils/supabase/server'
import { cookies } from 'next/headers'

type AnalyticsPageProps = {
  searchParams: Promise<AnalyticsSearchParams>
}

type AnalyticsSearchParams = {
  q?: string
  page?: string
  action?: string
  range?: string
  traffic?: string
}

const actionOptions = [
  ['all', 'All actions'],
  ['checkout_view', 'Checkout views'],
  ['checkout_attempt', 'Checkout attempts'],
  ['provider_redirect', 'Provider redirects'],
  ['stripe_session_created', 'Stripe sessions'],
  ['stripe_missing_config', 'Config issues'],
  ['stripe_error', 'Stripe errors'],
  ['stripe_price_sync', 'Stripe price syncs'],
  ['directory_click', 'Discovery clicks'],
  ['agent_page_view', 'AI agent page visits'],
]

const trafficOptions: Array<[AgentVisitTrafficFilter, string]> = [
  ['all', 'All traffic'],
  ['ai', 'Show only AI Agent visits'],
  ['human', 'Human/unknown only'],
]

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const filters = await searchParams
  const range = filters.range || '30d'
  const selectedTraffic = trafficOptions.some(([value]) => value === filters.traffic)
    ? (filters.traffic as AgentVisitTrafficFilter)
    : 'all'

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        <a href="/login?next=/dashboard/analytics" className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950">
          Sign in to view analytics
        </a>
      </main>
    )
  }

  const pages = await fetchOwnedPages(supabase, user.id)

  // Calculate date cutoff based on range
  const now = new Date()
  let cutoff = new Date(0) // all time

  if (range === '7d') {
    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (range === '30d') {
    cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  const { data: checkoutEvents } = await supabase
    .from('checkout_events')
    .select('*')
    .eq('owner_id', user.id)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)
    .returns<CheckoutEvent[]>()

  const { data: agentVisitRows, error: agentVisitError } = await supabase
    .from('agent_visits')
    .select('*')
    .eq('owner_id', user.id)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000)
    .returns<AgentVisit[]>()

  const events = checkoutEvents ?? []
  const agentVisits = agentVisitError && isMissingRelationError(agentVisitError) ? [] : (agentVisitRows ?? [])
  const ownedPages = pages ?? []
  const pageOptions = getPageOptions(ownedPages)
  const selectedAction = actionOptions.some(([value]) => value === filters.action) ? filters.action : 'all'
  const filteredEvents = filterAnalyticsEvents(events, {
    query: filters.q,
    pageId: filters.page,
    action: selectedAction,
  })
  const filteredAgentVisits = filterAgentVisits(agentVisits, {
    query: filters.q,
    pageId: filters.page,
    traffic: selectedTraffic,
  })
  const trafficSplit = getTrafficSplit(filteredAgentVisits)
  const agentTypeBreakdown = getAgentTypeBreakdown(filteredAgentVisits)
  const topAgentVisitPages = getTopPagesByAgentVisits(filteredAgentVisits, ownedPages).slice(0, 6)
  const readinessTrend = getReadinessTrendSummary(ownedPages)
  const recentAgentVisitLogs = filteredAgentVisits.filter((visit) => visit.is_ai_agent).slice(0, 10)
  const offerCount = ownedPages.reduce((sum, page) => sum + getOfferCount(page), 0)
  const agentPageVisits = trafficSplit.ai
  const discoveryClicks = getDiscoveryClickCount(filteredEvents)
  const attemptCount = getCheckoutAttemptCount(filteredEvents)
  const conversionCount = getConversionCount(filteredEvents)
  const conversionRate = filteredEvents.length
    ? ((conversionCount / Math.max(attemptCount || filteredEvents.length, 1)) * 100).toFixed(1)
    : '0.0'
  const revenueCents = getRevenueCents(filteredEvents)
  const pipelineCents = getPipelineCents(filteredEvents)
  const agentRevenueCents = getAgentDrivenRevenueCents ? getAgentDrivenRevenueCents(filteredEvents) : 0 // fallback if not yet
  const agentSharePct = 15 // configurable stub, future per plan
  const agentShareCents = Math.round(agentRevenueCents * (agentSharePct / 100))
  const popularService = getTopOfferStats(filteredEvents)[0]?.name || 'No offer activity yet'
  const dailySeries = mergeVisitCountsIntoDailySeries(getDailyEventSeries(filteredEvents, 10), filteredAgentVisits)
  const discoveryActions = getDiscoveryActionStats(filteredEvents)
  const discoverySurfaces = getDiscoverySurfaceStats(filteredEvents)
  const discoveryToIntentRate = discoveryClicks ? Math.round((attemptCount / discoveryClicks) * 100) : 0
  const topOffers = getTopOfferStats(filteredEvents).slice(0, 5)
  const maxDailyEvents = Math.max(...dailySeries.map((point) => point.total), 1)
  const maxOfferEvents = Math.max(...topOffers.map((offer) => offer.total), 1)

  // Top Pages by Agent Activity (Phase 2 + AI detection foundation)
  const topPages = topAgentVisitPages
  const maxPageEvents = Math.max(...topPages.map(p => p.total), 1)

  // Conversion Rate Leaders (Phase 2)
  const conversionLeaders = getTopOfferStats(filteredEvents)
    .map(o => ({
      ...o,
      conversionRate: o.attempts > 0 ? Math.round((o.conversions / o.attempts) * 100) : 0
    }))
    .filter(o => o.attempts >= 2) // only meaningful data
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 5)

  // Agent-Engaged Pages Quality Insight (Phase 2)
  const pagesWithActivity = new Set([
    ...filteredEvents.map(e => e.slug),
    ...filteredAgentVisits.filter((visit) => visit.is_ai_agent).map((visit) => visit.slug),
  ]);
  const activePages = ownedPages.filter(p => pagesWithActivity.has(p.slug));

  const computeReadiness = (p: any) => getReadinessScore({
    name: p.name,
    slug: p.slug,
    description: p.description,
    website_url: p.website_url,
    cta_url: p.cta_url,
    audience: p.audience,
    location: p.location,
    contact_email: p.contact_email,
    industry: p.industry,
    products: p.products ?? [],
    services: p.services ?? [],
    faqs: p.faqs ?? [],
    is_published: p.is_published,
  });

  const allReadinessScores = ownedPages.map(computeReadiness);
  const activeReadinessScores = activePages.map(computeReadiness);

  const avgAllReadiness = allReadinessScores.length > 0 
    ? Math.round(allReadinessScores.reduce((a, b) => a + b, 0) / allReadinessScores.length) 
    : 0;

  const avgActiveReadiness = activeReadinessScores.length > 0 
    ? Math.round(activeReadinessScores.reduce((a, b) => a + b, 0) / activeReadinessScores.length) 
    : 0;
  const exportParams = new URLSearchParams()

  if (filters.q) exportParams.set('q', filters.q)
  if (filters.page) exportParams.set('page', filters.page)
  if (selectedAction && selectedAction !== 'all') exportParams.set('action', selectedAction)
  if (range && range !== 'all') exportParams.set('range', range)
  if (selectedTraffic !== 'all') exportParams.set('traffic', selectedTraffic)

  const exportHref = `/api/analytics/export${exportParams.toString() ? `?${exportParams}` : ''}`

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <ErrorBoundary>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <div className="flex items-center gap-3">
            {/* Time range selector - Phase 2 */}
            <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-1 text-sm">
              {[
                { label: '7d', value: '7d' },
                { label: '30d', value: '30d' },
                { label: 'All', value: 'all' },
              ].map((r) => (
                <a
                  key={r.value}
                  href={makeAnalyticsHref(filters, { range: r.value })}
                  className={`rounded-md px-3 py-1 transition ${range === r.value ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/10'}`}
                >
                  {r.label}
                </a>
              ))}
            </div>

            <a href={exportHref} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10">
              <Download className="size-4" />
              Export CSV
            </a>
          </div>
        </div>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight">Analytics Dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          Track real agent-facing intent: classified AI visits, human traffic, directory discovery, provider handoffs, and Stripe checkout sessions.
        </p>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <Kpi title="Tracked Signals" value={(filteredEvents.length + filteredAgentVisits.length).toLocaleString()} note={`${events.length + agentVisits.length} total stored`} tone="strong" />
          <Kpi title="AI Agent Visits" value={agentPageVisits.toLocaleString()} note={`${trafficSplit.human} human/unknown visits`} />
          <Kpi title="Discovery Clicks" value={discoveryClicks.toLocaleString()} note="Directory + Marketplace clickthroughs" />
          <Kpi title="Conversion Rate" value={`${conversionRate}%`} note={`${conversionCount} conversion actions`} />
          <Kpi title="Most Active Offer" value={popularService} note={`${offerCount || 0} offers listed`} />
          <Kpi title="Tracked Revenue" value={formatUsdCents(revenueCents)} note={`${formatUsdCents(pipelineCents)} pipeline`} tone="strong" />
          <Kpi title="Agent-Driven Revenue" value={formatUsdCents(agentRevenueCents)} note={`${agentSharePct}% share est. = ${formatUsdCents(agentShareCents)} (Tier 3 monetization)`} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.85fr_0.48fr]">
          <Panel title={`Agent Traffic Over Time (${range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'All Time'})`}>
            <TrafficChart data={dailySeries} />
            <div className="mt-2 flex gap-4 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#7C3AED]" /> Total Signals
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" /> Agent Visits
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-400" /> Discovery
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#00F5FF]" /> Conversions
              </div>
            </div>
          </Panel>

          <Panel title="AI vs Human Traffic">
            <TrafficSplit split={trafficSplit} />
          </Panel>

          <Panel title="Agent Type Breakdown">
            <AgentTypeList rows={agentTypeBreakdown} />
          </Panel>

          <Panel title="Top Offers">
            {topOffers.length ? (
              <TopOffersChart offers={topOffers} max={maxOfferEvents} />
            ) : (
              <EmptyPanel message="No offer signals yet. Run a simulator dry-run or open a checkout page." />
            )}
          </Panel>

          <Panel title="Top Pages by Agent Activity">
            {topPages.length ? (
              <TopPagesChart pages={topPages} max={maxPageEvents} />
            ) : (
              <EmptyPanel message="No page activity yet." />
            )}
          </Panel>

          <Panel title="Conversion Rate Leaders">
            {conversionLeaders.length ? (
              <div className="space-y-4 pt-1">
                {conversionLeaders.map((offer, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="font-medium text-white truncate pr-2">
                        {offer.name}
                        <span className="ml-2 text-[10px] text-zinc-500 font-normal">/{offer.pageSlug}</span>
                      </div>
                      <div className="font-semibold text-emerald-300 shrink-0">{offer.conversionRate}%</div>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-300 rounded-full transition-all" 
                        style={{ width: `${Math.min(100, offer.conversionRate)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {offer.conversions} / {offer.attempts} conversions
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 pt-2">Not enough conversion data yet.</div>
            )}
          </Panel>



          <Panel title="Conversion Funnel">
            <ConversionFunnel 
              views={filteredEvents.length} 
              attempts={attemptCount} 
              conversions={conversionCount} 
            />
          </Panel>

          <Panel title="Discovery ROI">
            {discoveryClicks ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-200">Click to intent</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{discoveryToIntentRate}%</div>
                  <p className="mt-1 text-xs text-zinc-400">
                    Checkout attempts divided by discovery clicks in this filtered period.
                  </p>
                </div>
                <DiscoveryList title="Top actions" rows={discoveryActions} />
                <DiscoveryList title="Surfaces" rows={discoverySurfaces} />
              </div>
            ) : (
              <EmptyPanel message="No directory or marketplace clickthroughs yet. Publish pages and share the marketplace to start tracking discovery." />
            )}
          </Panel>

          <form action="/dashboard/analytics" className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <input type="hidden" name="range" value={range} />
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Filter className="size-4 text-cyan-200" />
              Filter
            </h2>
            <div className="mt-5 space-y-3">
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <input
                  name="q"
                  defaultValue={filters.q ?? ''}
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-cyan-300/60"
                  placeholder="Search event context..."
                />
              </label>
              <Select name="page" label="Page" defaultValue={filters.page ?? ''}>
                <option value="">All pages</option>
                {pageOptions.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.label}
                  </option>
                ))}
              </Select>
              <Select name="action" label="Action" defaultValue={selectedAction ?? 'all'}>
                {actionOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select name="traffic" label="Traffic" defaultValue={selectedTraffic}>
                {trafficOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <button className="mt-5 w-full rounded-lg bg-cyan-300 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-200">
              Apply filters
            </button>
            {(filters.q || filters.page || (selectedAction && selectedAction !== 'all') || selectedTraffic !== 'all') ? (
              <a href="/dashboard/analytics" className="mt-3 block text-center text-sm text-zinc-500 hover:text-white">
                Clear filters
              </a>
            ) : null}
          </form>
        </section>

        {/* Phase 2: Key Insights */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 text-zinc-200">Key Insights</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <div className="text-sm text-zinc-400">Quality of Agent-Engaged Pages</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-white">{avgActiveReadiness}</span>
                <span className="text-sm text-zinc-400">avg readiness</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Pages with real agent traffic vs your overall average ({avgAllReadiness}%)
              </div>
              {avgActiveReadiness > avgAllReadiness && (
                <div className="mt-2 text-xs text-emerald-300">↑ Higher quality pages tend to attract more agents</div>
              )}
            </div>

            <Insight
              title="Agent-engaged pages"
              value={`${activePages.length} / ${ownedPages.length}`}
              detail="Pages that received real agent traffic in the selected period"
            />

            <Insight
              title="AI agent page visits"
              value={String(agentPageVisits)}
              detail="Classified AI reads of your clean public pages"
            />

            <Insight
              title="Readiness trend"
              value={`${readinessTrend.currentAverage}%`}
              detail={`${formatTrendDelta(readinessTrend.delta)} from ${readinessTrend.versionSnapshots || ownedPages.length} page snapshots`}
            />

            <Insight
              title="Discovery clickthroughs"
              value={String(discoveryClicks)}
              detail="Tracked public directory + marketplace clicks for this period"
            />

            <Insight
              title="Agent-readable surface"
              value={`${ownedPages.filter((page) => page.is_published).length}/${ownedPages.length}`}
              detail="Published pages in discovery feeds"
            />
          </div>
        </div>

        <section className="mt-5 card !p-0">
          <div className="flex flex-col justify-between gap-3 border-b border-white/10 p-5 md:flex-row md:items-center">
            <h2 className="text-xl font-semibold">Agent Query Logs</h2>
            <p className="text-sm text-zinc-500">{recentAgentVisitLogs.length} recent AI visits</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.04] text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Agent Type</th>
                  <th className="px-5 py-3 font-medium">Query Before Landing</th>
                  <th className="px-5 py-3 font-medium">Page</th>
                  <th className="px-5 py-3 text-right font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recentAgentVisitLogs.map((visit) => (
                  <tr key={visit.id} className="border-t border-white/10">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <Bot className="size-4 text-cyan-200" />
                        {visit.agent_type}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-600">{formatEventDate(visit.created_at)}</span>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      <span className="line-clamp-1">{formatVisitQuery(visit)}</span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-cyan-200">/{visit.slug}</td>
                    <td className="px-5 py-4 text-right text-emerald-200">{Math.round(Number(visit.confidence_score || 0))}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentAgentVisitLogs.length ? (
              <div className="p-10 text-center text-sm text-zinc-500">
                No agent query logs yet. Referrer query parameters are captured when agents send them.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 card !p-0">
          <div className="flex flex-col justify-between gap-3 border-b border-white/10 p-5 md:flex-row md:items-center">
            <h2 className="text-xl font-semibold">Recent Agent Interactions</h2>
            <p className="text-sm text-zinc-500">{filteredEvents.length} matching signals</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.04] text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">User-Agent</th>
                  <th className="px-5 py-3 font-medium">Query</th>
                  <th className="px-5 py-3 font-medium">Action Taken</th>
                  <th className="px-5 py-3 text-right font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.slice(0, 10).map((event) => (
                  <tr key={event.id} className="border-t border-white/10">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <Bot className="size-4 text-cyan-200" />
                        {getAgentName(event.agent_user_agent)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      <span className="line-clamp-1">{event.query || event.offer_name}</span>
                      <span className="mt-1 block font-mono text-xs text-zinc-600">/{event.slug}</span>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {getEventActionLabel(event.event_type)}
                      <span className="mt-1 block text-xs text-zinc-600">{formatEventDate(event.created_at)}</span>
                    </td>
                    <td className="px-5 py-4 text-right text-cyan-200">{getSignalLabel(event)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredEvents.length ? (
              <div className="p-10 text-center text-sm text-zinc-500">
                No matching analytics events yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
      </ErrorBoundary>
    </main>
  )
}

function Kpi({
  title,
  value,
  delta,
  note,
  tone,
}: {
  title: string
  value: string
  delta?: string
  note?: string
  tone?: 'strong'
}) {
  return (
    <div className={`rounded-lg border border-white/10 p-5 ${tone ? 'bg-cyan-300/15' : 'bg-white/[0.04]'}`}>
      <p className="text-sm text-zinc-300">{title}</p>
      <p className="mt-3 text-4xl font-semibold tracking-tight">{value}</p>
      {delta ? (
        <p className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-200">
          <ArrowUpRight className="size-4" />
          {delta}
        </p>
      ) : null}
      {note ? <p className="mt-3 text-sm text-zinc-400">{note}</p> : null}
    </div>
  )
}

function TrafficSplit({ split }: { split: ReturnType<typeof getTrafficSplit> }) {
  const aiShare = split.total ? Math.round((split.ai / split.total) * 100) : 0
  const humanShare = split.total ? Math.round((split.human / split.total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-full border border-white/10 bg-black/30">
        <div className="h-3 bg-gradient-to-r from-[#00F5FF] via-[#7C3AED] to-[#C4B5FD]" style={{ width: `${aiShare}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3">
          <p className="text-xs text-cyan-100">AI agents</p>
          <p className="mt-1 text-2xl font-semibold">{split.ai}</p>
          <p className="mt-1 text-xs text-zinc-500">{aiShare}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-zinc-400">Human/unknown</p>
          <p className="mt-1 text-2xl font-semibold">{split.human}</p>
          <p className="mt-1 text-xs text-zinc-500">{humanShare}%</p>
        </div>
      </div>
    </div>
  )
}

function AgentTypeList({ rows }: { rows: ReturnType<typeof getAgentTypeBreakdown> }) {
  if (!rows.length) {
    return <EmptyPanel message="No classified AI agent traffic yet." />
  }

  return (
    <div className="space-y-3">
      {rows.slice(0, 6).map((row) => (
        <div key={row.agentType} className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-zinc-200">{row.agentType}</span>
            <span className="font-mono text-cyan-200">{row.total}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(100, Math.round(row.avgConfidence))}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">{Math.round(row.avgConfidence)}% average confidence</p>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Select({
  name,
  label,
  defaultValue,
  children,
}: {
  name: string
  label: string
  defaultValue: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-zinc-500">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-200 outline-none focus:border-cyan-300/60"
      >
        {children}
      </select>
    </label>
  )
}

function Insight({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-zinc-400">{detail}</p>
    </div>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
      {message}
    </div>
  )
}

function DiscoveryList({ title, rows }: { title: string; rows: Array<{ label: string; total: number }> }) {
  if (!rows.length) return null

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">{title}</div>
      <div className="space-y-2">
        {rows.slice(0, 4).map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <span className="capitalize text-zinc-300">{row.label}</span>
            <span className="font-mono text-cyan-200">{row.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function mergeVisitCountsIntoDailySeries(series: ReturnType<typeof getDailyEventSeries>, visits: AgentVisit[]) {
  const visitCounts = new Map<string, { total: number; ai: number }>()

  for (const visit of visits) {
    const dateKey = formatLocalDateKey(new Date(visit.created_at))
    const current = visitCounts.get(dateKey) ?? { total: 0, ai: 0 }
    current.total += 1
    if (visit.is_ai_agent) current.ai += 1
    visitCounts.set(dateKey, current)
  }

  return series.map((point) => {
    const counts = visitCounts.get(point.dateKey)

    return {
      ...point,
      total: point.total + (counts?.total ?? 0),
      agentVisits: counts?.ai ?? point.agentVisits,
    }
  })
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function makeAnalyticsHref(current: AnalyticsSearchParams, overrides: Partial<AnalyticsSearchParams>) {
  const next = { ...current, ...overrides }
  const params = new URLSearchParams()

  if (next.range && next.range !== '30d') params.set('range', next.range)
  if (next.q) params.set('q', next.q)
  if (next.page) params.set('page', next.page)
  if (next.action && next.action !== 'all') params.set('action', next.action)
  if (next.traffic && next.traffic !== 'all') params.set('traffic', next.traffic)

  const query = params.toString()
  return `/dashboard/analytics${query ? `?${query}` : ''}`
}

function formatTrendDelta(delta: number) {
  if (delta > 0) return `up ${delta} pts`
  if (delta < 0) return `down ${Math.abs(delta)} pts`
  return 'flat'
}

function formatVisitQuery(visit: AgentVisit) {
  if (visit.query) return visit.query
  if (visit.referrer) return visit.referrer
  return 'No query captured'
}

async function fetchOwnedPages(supabase: ReturnType<typeof createClient>, ownerId: string) {
  const result = await supabase
    .from('pages')
    .select(OWNER_PAGE_SELECT)
    .eq('owner_id', ownerId)
    .returns<AgentPage[]>()

  if (!result.error || !isMissingColumnError(result.error)) {
    return result.data ?? []
  }

  const fallback = await supabase
    .from('pages')
    .select(BASIC_OWNER_PAGE_SELECT)
    .eq('owner_id', ownerId)
    .returns<AgentPage[]>()

  return fallback.data ?? []
}

function isMissingColumnError(error: { code?: string; message?: string }) {
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(error.message ?? '')
}
