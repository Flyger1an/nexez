import { ArrowDownRight, ArrowUpRight, BarChart3, Bot, Download, Filter, Lock, Minus, Search, Sparkles } from 'lucide-react'
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
  getDailyEventSeries,
  getDiscoveryActionStats,
  getDiscoveryClickCount,
  getDiscoverySurfaceStats,
  getPageOptions,
  getReadinessInsight,
  analyticsRangeBounds,
  clampHistoryRange,
  previousPeriodBounds,
  pctDelta,
  type KpiDelta,
  getRevenueCurrency,
  getSignalLabel,
  getTopOfferStats,
} from '../../../lib/analytics'
import { formatCurrencyAmount } from '../../../lib/currency'
import { formatDisplayDate, resolveDisplayLocale } from '../../../lib/international-operations'
import { rollupAbResults } from '../../../lib/ab-testing'
import { AgentNegotiation, summarizeNegotiations } from '../../../lib/negotiations'
import { getTopQueries, getTopReferrers, getUnservedQueries } from '../../../lib/demand-insights'
import { CheckoutEvent, getEventActionLabel } from '../../../lib/checkout-events'
import { createClient } from '../../../utils/supabase/server'
import { cookies, headers } from 'next/headers'
import AnalyticsActions from './AnalyticsActions'
import { agentRuntimeUrl, appUrl } from '../../../lib/site'
import { getOwnerPlanId } from '../../../lib/server/plan'
import { minPlanForFeature, planAllows } from '../../../lib/billing'
import { PlanBadge } from '../../../components/billing/PlanGate'
import {
  getCurrencyOptions as getOrderCurrencyOptions,
  rollupFinanceByCurrency,
  type DirectFinanceRow,
} from '../../../lib/finance-analytics'
import { DataLoadNotice } from '../../../components/dashboard/DataLoadNotice'
import {
  buildAnalyticsFunnel,
  canonicalOrderChannel,
  formatAnalyticsRate,
  getAnalyticsChannelLabel,
  getOrderChannelBreakdown,
  summarizeAnalyticsTrust,
} from '../../../lib/analytics-report'
import { loadOwnerAnalyticsRollup } from '../../../lib/server/analytics-rollup'

type AnalyticsPageProps = {
  searchParams: Promise<AnalyticsSearchParams>
}

type AnalyticsSearchParams = {
  q?: string
  page?: string
  action?: string
  range?: string
  traffic?: string
  from?: string
  to?: string
}

const actionOptions = [
  ['all', 'All actions'],
  ['checkout_view', 'Checkout views'],
  ['checkout_attempt', 'Checkout attempts'],
  ['provider_redirect', 'External booking links'],
  ['stripe_session_created', 'Stripe checkout starts'],
  ['stripe_missing_config', 'Setup issues'],
  ['stripe_error', 'Stripe errors'],
  ['stripe_price_sync', 'Stripe price syncs'],
  ['directory_click', 'Discovery clicks'],
  ['agent_page_view', 'AI agent listing visits'],
]

const trafficOptions: Array<[AgentVisitTrafficFilter, string]> = [
  ['all', 'All traffic'],
  ['ai', 'Show only AI Agent visits'],
  ['human', 'Human/unknown only'],
]

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const [filters, cookieStore, headerStore] = await Promise.all([searchParams, cookies(), headers()])
  const locale = resolveDisplayLocale(headerStore.get('accept-language'))
  const selectedTraffic = trafficOptions.some(([value]) => value === filters.traffic)
    ? (filters.traffic as AgentVisitTrafficFilter)
    : 'all'

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

  // analyticsHistory (Pro): All-time + custom date ranges are Pro-only; today/1d/7d/30d
  // stay free. Clamp gated selections server-side so a URL like ?range=all or
  // ?from=2020-01-01 can't read history beyond the free window (the UI teaser alone
  // is bypassable). The CSV export route applies the same clamp.
  const [pages, ownerPlanId] = await Promise.all([
    fetchOwnedPages(supabase, user.id),
    getOwnerPlanId(supabase, user.id),
  ])
  const fullHistory = planAllows(ownerPlanId, 'analyticsHistory')
  const historyWindow = clampHistoryRange({ range: filters.range, from: filters.from, to: filters.to }, fullHistory)
  const range = historyWindow.range || '30d'

  // Resolve the time window: preset (1d/7d/30d/all) or a custom from/to range.
  const rangeBounds = analyticsRangeBounds(historyWindow)
  const { cutoff, until, isCustom } = rangeBounds
  const ownedPages = pages ?? []
  const pageOptions = getPageOptions(ownedPages)
  const selectedPage = ownedPages.find((page) => page.id === filters.page) ?? null
  const selectedPageId = selectedPage?.id ?? ''
  const scopedPages = selectedPage ? [selectedPage] : ownedPages
  const selectedAction = actionOptions.some(([value]) => value === filters.action) ? filters.action : 'all'

  let checkoutEventsQuery = supabase
    .from('checkout_events')
    .select('*')
    .eq('owner_id', user.id)
    .gte('created_at', cutoff.toISOString())
  if (until) checkoutEventsQuery = checkoutEventsQuery.lte('created_at', until.toISOString())
  if (selectedPageId) checkoutEventsQuery = checkoutEventsQuery.eq('page_id', selectedPageId)
  if (selectedAction !== 'all') checkoutEventsQuery = checkoutEventsQuery.eq('event_type', selectedAction)
  let liveOrdersQuery = supabase
    .from('checkout_orders')
    .select('id, page_id, offer_name, offer_key, amount_cents, currency, status, channel, slug, refunded_cents, buyer_email, buyer_name, buyer_reference, buyer_agent, commission_percent, application_fee_cents, stripe_livemode, created_at')
    .eq('owner_id', user.id)
    .eq('stripe_livemode', true)
    .gte('created_at', cutoff.toISOString())
  if (until) liveOrdersQuery = liveOrdersQuery.lte('created_at', until.toISOString())
  if (selectedPageId) liveOrdersQuery = liveOrdersQuery.eq('page_id', selectedPageId)
  let agentVisitsQuery = supabase
    .from('agent_visits')
    .select('*')
    .eq('owner_id', user.id)
    .gte('created_at', cutoff.toISOString())
  if (until) agentVisitsQuery = agentVisitsQuery.lte('created_at', until.toISOString())
  if (selectedPageId) agentVisitsQuery = agentVisitsQuery.eq('page_id', selectedPageId)
  if (selectedTraffic === 'ai') agentVisitsQuery = agentVisitsQuery.eq('is_ai_agent', true)
  if (selectedTraffic === 'human') agentVisitsQuery = agentVisitsQuery.eq('is_ai_agent', false)
  let negotiationsQuery = supabase
    .from('agent_negotiations')
    .select('status, created_at')
    .eq('owner_id', user.id)
    .or('stripe_livemode.is.null,stripe_livemode.eq.true')
    .gte('created_at', cutoff.toISOString())
  if (until) negotiationsQuery = negotiationsQuery.lte('created_at', until.toISOString())
  if (selectedPageId) negotiationsQuery = negotiationsQuery.eq('page_id', selectedPageId)
  const [checkoutResult, orderResult, visitResult, negotiationResult, rollupResult] = await Promise.all([
    checkoutEventsQuery
      .order('created_at', { ascending: false })
      .limit(500)
      .returns<CheckoutEvent[]>(),
    liveOrdersQuery
      .order('created_at', { ascending: false })
      .limit(1000)
      .returns<DirectFinanceRow[]>(),
    agentVisitsQuery
      .order('created_at', { ascending: false })
      .limit(1000)
      .returns<AgentVisit[]>(),
    negotiationsQuery.returns<Pick<AgentNegotiation, 'status'>[]>(),
    loadOwnerAnalyticsRollup(supabase, {
      from: cutoff,
      to: until,
      pageId: selectedPageId,
      query: filters.q,
      eventType: selectedAction,
      traffic: selectedTraffic,
    }),
  ])
  const { data: checkoutEvents, error: checkoutEventsError } = checkoutResult
  const { data: liveOrderRows, error: liveOrderError } = orderResult
  const { data: agentVisitRows, error: agentVisitError } = visitResult
  const { data: negotiationRows, error: negotiationError } = negotiationResult
  const analyticsRollup = rollupResult.data

  const events = checkoutEvents ?? []
  const liveOrders = liveOrderRows ?? []
  const agentVisits = agentVisitError && isMissingRelationError(agentVisitError) ? [] : (agentVisitRows ?? [])
  const negotiations =
    negotiationError && isMissingRelationError(negotiationError) ? [] : negotiationRows ?? []
  const dataIssues = [
    checkoutEventsError ? 'checkout activity' : null,
    liveOrderError ? 'paid orders' : null,
    agentVisitError ? 'traffic classification' : null,
    negotiationError ? 'negotiations' : null,
    rollupResult.error ? 'exact analytics totals' : null,
  ].filter((issue): issue is string => Boolean(issue))
  const negotiationSummary = summarizeNegotiations(negotiations)
  const normalizedFilters: AnalyticsSearchParams = {
    ...filters,
    // Use the plan-clamped time window so links never carry a gated range.
    range: historyWindow.range,
    from: historyWindow.from,
    to: historyWindow.to,
    page: selectedPageId || undefined,
    action: selectedAction === 'all' ? undefined : selectedAction,
    traffic: selectedTraffic === 'all' ? undefined : selectedTraffic,
  }
  const filteredEvents = filterAnalyticsEvents(events, {
    query: filters.q,
    pageId: selectedPageId || undefined,
    action: selectedAction,
  })
  const filteredAgentVisits = filterAgentVisits(agentVisits, {
    query: filters.q,
    pageId: selectedPageId || undefined,
    traffic: selectedTraffic,
  })
  const queryNeedle = filters.q?.trim().toLowerCase() || ''
  const filteredOrders = selectedAction === 'all' || selectedAction === 'stripe_session_created'
    ? liveOrders.filter((order) => {
        if (selectedPageId && order.page_id !== selectedPageId) return false
        if (!queryNeedle) return true
        return [order.offer_name, order.offer_key, order.slug, order.buyer_agent, order.buyer_name, order.buyer_email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(queryNeedle))
      })
    : []
  const sampledTrafficSplit = getTrafficSplit(filteredAgentVisits)
  const trafficSplit = analyticsRollup
    ? {
        ai: analyticsRollup.counts.aiVisits,
        human: analyticsRollup.counts.humanVisits,
        total: analyticsRollup.counts.visits,
      }
    : sampledTrafficSplit
  const agentTypeBreakdown = analyticsRollup
    ? analyticsRollup.agentTypes.map((row) => ({
        agentType: row.agentType,
        total: row.visits,
        avgConfidence: row.avgConfidence,
      }))
    : getAgentTypeBreakdown(filteredAgentVisits)
  const topAgentVisitPages = analyticsRollup
    ? analyticsRollup.topPages.map((row) => ({
        pageId: row.pageId,
        slug: row.slug,
        name: row.name,
        total: row.visits,
      }))
    : getTopPagesByAgentVisits(filteredAgentVisits, ownedPages).slice(0, 6)
  const readinessTrend = getReadinessTrendSummary(ownedPages)
  const recentAgentVisitLogs = filteredAgentVisits.filter((visit) => visit.is_ai_agent).slice(0, 10)
  const offerCount = scopedPages.reduce((sum, page) => sum + getOfferCount(page), 0)
  const agentPageVisits = trafficSplit.ai
  const topQueries = analyticsRollup
    ? analyticsRollup.topQueries.map((row) => ({ query: row.query, count: row.uses }))
    : getTopQueries(filteredEvents, filteredAgentVisits)
  const topReferrers = analyticsRollup
    ? analyticsRollup.topReferrers.map((row) => ({ query: row.referrer, count: row.visits }))
    : getTopReferrers(filteredAgentVisits)
  // Offers to compare queries against: the filtered page if one is selected, else all owned pages.
  const offerScopePages = scopedPages
  const offerTexts = offerScopePages.flatMap((p) =>
    [...(p.services ?? []), ...(p.products ?? [])].map((o) => `${o.name} ${o.description ?? ''}`),
  )
  const unservedQueries = getUnservedQueries(topQueries, offerTexts)
  const sampledFunnel = buildAnalyticsFunnel(filteredEvents, filteredAgentVisits, filteredOrders)
  const funnel = analyticsRollup
    ? {
        listingVisits: analyticsRollup.counts.visits,
        checkoutAttempts: analyticsRollup.counts.checkoutAttempts,
        checkoutStarts: analyticsRollup.counts.checkoutStarts,
        paidDirectOrders: analyticsRollup.counts.paidDirectOrders,
        retainedDirectOrders: analyticsRollup.counts.retainedDirectOrders,
        startRate: analyticsRollup.counts.checkoutAttempts
          ? analyticsRollup.counts.checkoutStarts / analyticsRollup.counts.checkoutAttempts
          : null,
        paidRate: analyticsRollup.counts.checkoutStarts
          ? analyticsRollup.counts.paidDirectOrders / analyticsRollup.counts.checkoutStarts
          : null,
        retentionRate: analyticsRollup.counts.paidDirectOrders
          ? analyticsRollup.counts.retainedDirectOrders / analyticsRollup.counts.paidDirectOrders
          : null,
        attributionComplete: analyticsRollup.counts.paidDirectOrders <= analyticsRollup.counts.checkoutStarts,
      }
    : sampledFunnel
  const discoveryClicks = analyticsRollup?.counts.discoveryClicks ?? getDiscoveryClickCount(filteredEvents)
  const attemptCount = funnel.checkoutAttempts
  const checkoutStartCount = funnel.checkoutStarts
  const conversionCount = funnel.paidDirectOrders
  const conversionRate = formatAnalyticsRate(funnel.attributionComplete ? funnel.paidRate : null)
  const trackedSignals = analyticsRollup
    ? analyticsRollup.counts.events + analyticsRollup.counts.visits
    : filteredEvents.length + filteredAgentVisits.length
  const eventTrust = analyticsRollup?.trust.events ?? summarizeAnalyticsTrust(filteredEvents)
  const visitTrust = analyticsRollup?.trust.visits ?? summarizeAnalyticsTrust(filteredAgentVisits)
  // Resolve the settlement currency FIRST and scope every rollup to it - the
  // KPI renders one currency code, so amounts settling in other currencies
  // must not be mixed into the number (they're different units).
  const exactRevenueRow = analyticsRollup?.currencies[0]
  const revenueCurrency = exactRevenueRow?.currency ?? getOrderCurrencyOptions(filteredOrders)[0] ?? getRevenueCurrency(filteredEvents)
  const revenueRow = rollupFinanceByCurrency(filteredOrders, 0).find((row) => row.currency === revenueCurrency)
  const revenueCents = exactRevenueRow?.gmvCents ?? revenueRow?.gmvCents ?? 0
  const refundedCents = exactRevenueRow?.refundedCents ?? revenueRow?.refundedCents ?? 0
  const agentShareCents = exactRevenueRow?.feeCents ?? revenueRow?.nexezFeeCents ?? 0
  const money = (cents: number) => formatCurrencyAmount(cents, revenueCurrency, locale)
  const offerActivity = analyticsRollup
    ? analyticsRollup.topOffers.map((offer) => ({
        name: offer.offerName,
        pageSlug: offer.slug,
        total: offer.signals,
        attempts: offer.attempts,
        conversions: offer.paidOrders,
      }))
    : getTopOfferStats(filteredEvents)
  const paidByOffer = new Map<string, number>()
  for (const order of filteredOrders) {
    if (!['legacy_direct', 'agent_checkout'].includes(canonicalOrderChannel(order))) continue
    const key = `${order.slug ?? ''}:${order.offer_name ?? order.offer_key ?? ''}`
    paidByOffer.set(key, (paidByOffer.get(key) ?? 0) + 1)
  }
  const popularService = offerActivity[0]?.name || 'No offer activity yet'
  const dailySeries = analyticsRollup
    ? analyticsRollup.daily.map((point) => ({
        label: formatDisplayDate(point.date, locale, { month: 'short', day: 'numeric', year: undefined }),
        dateKey: formatUtcDateKey(new Date(point.date)),
        total: point.eventSignals + point.visits,
        agentVisits: point.aiVisits,
        discovery: point.discoveryClicks,
        conversions: point.paidOrders,
      }))
    : mergePaidOrdersIntoDailySeries(
        mergeVisitCountsIntoDailySeries(getDailyEventSeries(filteredEvents, 10, locale), filteredAgentVisits),
        filteredOrders,
      )
  const discoveryActions = getDiscoveryActionStats(filteredEvents)
  const discoverySurfaces = getDiscoverySurfaceStats(filteredEvents)
  const discoveryToIntentRate = discoveryClicks ? Math.round((attemptCount / discoveryClicks) * 100) : null
  const channelBreakdown = analyticsRollup
    ? analyticsRollup.channels.map((row) => ({ ...row, label: getAnalyticsChannelLabel(row.channel) }))
    : getOrderChannelBreakdown(filteredOrders)
  const topOffers = offerActivity
    .map((offer) => ({
      ...offer,
      conversions: analyticsRollup
        ? offer.conversions
        : paidByOffer.get(`${offer.pageSlug}:${offer.name}`) ?? 0,
    }))
    .slice(0, 5)
  const maxOfferEvents = Math.max(...topOffers.map((offer) => offer.total), 1)

  // Period-over-period deltas: fetch the equal-length window immediately before
  // the current one (bounded presets only - all-time/custom have no "prev") and
  // compare the headline KPIs apples-to-apples (same page/action/traffic/query).
  const prevBounds = previousPeriodBounds(rangeBounds)
  const periodLabel =
    range === 'today' ? 'prior period' : range === '1d' ? 'prev 24h' : range === '7d' ? 'prev 7d' : 'prev 30d'
  const periodHuman =
    range === 'today'
      ? 'the prior period'
      : range === '1d'
        ? 'the previous 24 hours'
        : range === '7d'
          ? 'the previous 7 days'
          : 'the previous 30 days'
  let signalsDelta: KpiDelta | null = null
  let agentVisitsDelta: KpiDelta | null = null
  let revenueDelta: KpiDelta | null = null
  let conversionDelta: KpiDelta | null = null
  if (prevBounds) {
    const [prevCheckoutResult, prevVisitResult, prevOrderResult, prevRollupResult] = await Promise.all([
      supabase
        .from('checkout_events')
        .select('*')
        .eq('owner_id', user.id)
        .gte('created_at', prevBounds.cutoff.toISOString())
        .lt('created_at', prevBounds.until.toISOString())
        .order('created_at', { ascending: false })
        .limit(500)
        .returns<CheckoutEvent[]>(),
      supabase
        .from('agent_visits')
        .select('*')
        .eq('owner_id', user.id)
        .gte('created_at', prevBounds.cutoff.toISOString())
        .lt('created_at', prevBounds.until.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000)
        .returns<AgentVisit[]>(),
      supabase
        .from('checkout_orders')
        .select('id, page_id, offer_name, offer_key, amount_cents, currency, status, channel, slug, refunded_cents, buyer_email, buyer_name, buyer_reference, buyer_agent, commission_percent, application_fee_cents, stripe_livemode, created_at')
        .eq('owner_id', user.id)
        .eq('stripe_livemode', true)
        .gte('created_at', prevBounds.cutoff.toISOString())
        .lt('created_at', prevBounds.until.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000)
        .returns<DirectFinanceRow[]>(),
      loadOwnerAnalyticsRollup(supabase, {
        from: prevBounds.cutoff,
        to: new Date(prevBounds.until.getTime() - 1),
        pageId: selectedPageId,
        query: filters.q,
        eventType: selectedAction,
        traffic: selectedTraffic,
      }),
    ])
    const { data: prevCheckoutRows } = prevCheckoutResult
    const { data: prevVisitRows } = prevVisitResult
    const { data: prevOrderRows } = prevOrderResult
    if (prevCheckoutResult.error) dataIssues.push('previous-period checkout activity')
    if (prevVisitResult.error) dataIssues.push('previous-period traffic')
    if (prevOrderResult.error) dataIssues.push('previous-period orders')
    if (prevRollupResult.error) dataIssues.push('exact previous-period totals')
    const prevEvents = filterAnalyticsEvents(prevCheckoutRows ?? [], {
      query: filters.q,
      pageId: selectedPageId || undefined,
      action: selectedAction,
    })
    const prevVisits = filterAgentVisits(prevVisitRows ?? [], {
      query: filters.q,
      pageId: selectedPageId || undefined,
      traffic: selectedTraffic,
    })
    const prevOrders = selectedAction === 'all' || selectedAction === 'stripe_session_created'
      ? (prevOrderRows ?? []).filter((order) => {
          if (selectedPageId && order.page_id !== selectedPageId) return false
          if (!queryNeedle) return true
          return [order.offer_name, order.offer_key, order.slug, order.buyer_agent, order.buyer_name, order.buyer_email]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(queryNeedle))
        })
      : []
    const prevFunnel = buildAnalyticsFunnel(prevEvents, prevVisits, prevOrders)
    const prevCounts = prevRollupResult.data?.counts
    const prevStarts = prevCounts?.checkoutStarts ?? prevFunnel.checkoutStarts
    const prevPaid = prevCounts?.paidDirectOrders ?? prevFunnel.paidDirectOrders
    const prevAttributionComplete = prevPaid <= prevStarts
    const prevConversionRate = prevAttributionComplete && prevStarts > 0 ? (prevPaid / prevStarts) * 100 : null
    const prevRevenueCents = prevRollupResult.data?.currencies
      .find((row) => row.currency === revenueCurrency)?.gmvCents
      ?? rollupFinanceByCurrency(prevOrders, 0).find((row) => row.currency === revenueCurrency)?.gmvCents
      ?? 0
    const prevSignals = prevCounts
      ? prevCounts.events + prevCounts.visits
      : prevEvents.length + prevVisits.length
    const prevAiVisits = prevCounts?.aiVisits ?? getTrafficSplit(prevVisits).ai
    signalsDelta = pctDelta(
      trackedSignals,
      prevSignals,
      periodLabel,
    )
    agentVisitsDelta = pctDelta(agentPageVisits, prevAiVisits, periodLabel)
    // The prev period sums in the SAME currency as the current one, so the
    // delta compares like units even if the workspace switched currencies.
    revenueDelta = pctDelta(revenueCents, prevRevenueCents, periodLabel)
    const currentConversionRate = funnel.attributionComplete && funnel.paidRate != null ? funnel.paidRate * 100 : null
    conversionDelta = currentConversionRate != null && prevConversionRate != null
      ? pctDelta(currentConversionRate, prevConversionRate, periodLabel)
      : null
  }

  // One-line takeaway from the biggest movers (drives the insight band).
  const movers = [
    { label: 'agent visits', d: agentVisitsDelta },
    { label: 'tracked revenue', d: revenueDelta },
    { label: 'paid checkout rate', d: conversionDelta },
    { label: 'total signals', d: signalsDelta },
  ]
    .map(({ label, d }) => {
      if (!d || d.dir === 'flat') return null
      const pct = d.text.match(/-?\d+%/)?.[0]
      if (!pct) return d.text.startsWith('new') ? `${label} started from zero` : null
      return `${label} ${d.dir === 'up' ? 'up' : 'down'} ${pct.replace('-', '')}`
    })
    .filter((p): p is string => Boolean(p))
    .slice(0, 3)
  const insightSentence = movers.length
    ? `Versus ${periodHuman}, ${movers.length === 1 ? movers[0] : `${movers.slice(0, -1).join(', ')} and ${movers[movers.length - 1]}`}.`
    : null

  // Top Pages by Agent Activity (Phase 2 + AI detection foundation)
  const topPages = topAgentVisitPages
  const maxPageEvents = Math.max(...topPages.map(p => p.total), 1)

  // Conversion Rate Leaders (Phase 2)
  const conversionLeaders = offerActivity
    .map(o => ({
      ...o,
      conversionRate: o.attempts > 0
        ? Math.round((o.conversions / o.attempts) * 100)
        : 0,
    }))
    .filter(o => o.attempts >= 2) // only meaningful data
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 5)

  // A/B Tests (Phase 6): impressions + conversions attributed per served variant.
  // Ignore the action facet here so a "conversions only" view can't hide the
  // impression denominator - but still respect page/search/time scope.
  const abTests = rollupAbResults(
    filterAnalyticsEvents(events, { query: filters.q, pageId: selectedPageId || undefined }),
  )

  // Readiness ROI insight: all pages vs. the agent-engaged subset.
  const {
    avgAll: avgAllReadiness,
    avgActive: avgActiveReadiness,
    activeCount: agentEngagedPageCount,
  } = getReadinessInsight(
    ownedPages,
    analyticsRollup
      ? analyticsRollup.activePageIds.flatMap((pageId) => {
          const page = ownedPages.find((candidate) => candidate.id === pageId)
          return page ? [{ slug: page.slug }] : []
        })
      : filteredEvents,
    analyticsRollup ? [] : filteredAgentVisits,
  )

  const exportParams = new URLSearchParams()

  if (filters.q) exportParams.set('q', filters.q)
  if (selectedPageId) exportParams.set('page', selectedPageId)
  if (selectedAction && selectedAction !== 'all') exportParams.set('action', selectedAction)
  if (isCustom) {
    if (historyWindow.from) exportParams.set('from', historyWindow.from)
    if (historyWindow.to) exportParams.set('to', historyWindow.to)
  } else if (range && range !== 'all') {
    exportParams.set('range', range)
  }
  if (selectedTraffic !== 'all') exportParams.set('traffic', selectedTraffic)

  const exportHref = `/api/analytics/export${exportParams.toString() ? `?${exportParams}` : ''}`
  const pageViewTitle = selectedPage ? selectedPage.name : 'All listings'
  const pageViewSubtitle = selectedPage
    ? `Showing only signals for /${selectedPage.slug}.`
    : 'Showing signals across every listing in your workspace.'
  const selectedPageReadiness = selectedPage ? getReadinessScore(selectedPage) : avgAllReadiness
  const activeFilterCount = [
    filters.q,
    selectedPageId,
    selectedAction !== 'all' ? selectedAction : '',
    selectedTraffic !== 'all' ? selectedTraffic : '',
    isCustom ? `${historyWindow.from ?? ''}${historyWindow.to ?? ''}` : range !== '30d' ? range : '',
  ].filter(Boolean).length

  return (
    <main className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <ErrorBoundary>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="surface-masthead">
          <p className="surface-eyebrow">Platform intelligence</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--settings-emphasis)]">
              <BarChart3 className="size-5" aria-hidden="true" />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Analytics</h1>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            Track real agent-facing intent: classified AI visits, human traffic, directory discovery, provider handoffs, and Stripe checkout sessions.
          </p>
          <DataLoadNotice issues={dataIssues} />
        </header>

        <section className="mt-6 rounded-lg border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Filter className="size-4 text-[var(--signal)]" />
                Filter analytics
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Set the listing, action, traffic type, and time window before reading the charts below.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-300">
                {activeFilterCount ? `${activeFilterCount} active` : 'Default view'}
              </span>
              <a href={exportHref} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/10">
                <Download className="size-4" />
                Export CSV
              </a>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
            <form action="/dashboard/analytics" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {isCustom ? (
                <>
                  {historyWindow.from ? <input type="hidden" name="from" value={historyWindow.from} /> : null}
                  {historyWindow.to ? <input type="hidden" name="to" value={historyWindow.to} /> : null}
                </>
              ) : (
                <input type="hidden" name="range" value={range} />
              )}
              <label className="relative block md:col-span-2 xl:col-span-1">
                <span className="mb-2 block text-xs text-zinc-500">Search</span>
                <Search className="absolute bottom-3.5 left-3 size-4 text-zinc-500" />
                <input
                  name="q"
                  defaultValue={filters.q ?? ''}
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[var(--signal)]/60"
                  placeholder="Event context..."
                />
              </label>
              <Select name="page" label="Listing" defaultValue={selectedPageId}>
                <option value="">All listings</option>
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
              <div className="flex flex-col gap-2 md:flex-row md:items-end xl:col-span-4">
                <button className="h-11 rounded-lg bg-[var(--signal)] px-5 text-sm font-semibold text-zinc-950 hover:bg-[var(--signal)]">
                  Apply filters
                </button>
                {activeFilterCount ? (
                  <a href="/dashboard/analytics" className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 px-4 text-sm text-zinc-400 hover:bg-white/10 hover:text-white">
                    Clear filters
                  </a>
                ) : null}
              </div>
            </form>

            <div className="min-w-0 border-t border-white/10 pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
              <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--signal)]">
                Time window
                {!fullHistory && <PlanBadge feature="analyticsHistory" />}
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                {[
                  { label: 'Today', value: 'today' },
                  { label: '1d', value: '1d' },
                  { label: '7d', value: '7d' },
                  { label: '30d', value: '30d' },
                  { label: 'All', value: 'all' },
                ].map((r) => {
                  // 'All time' is a Pro (analyticsHistory) capability - show it locked for lower tiers.
                  if (r.value === 'all' && !fullHistory) {
                    return (
                      <a
                        key={r.value}
                        href={appUrl(`/dashboard/billing?plan=${minPlanForFeature('analyticsHistory').id}`)}
                        title="All-time history is on the Pro plan"
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--signal)]/30 bg-[var(--signal)]/[0.06] px-3 py-2 text-zinc-400 transition hover:bg-[var(--signal)]/15"
                      >
                        <Lock className="size-3.5 text-[var(--signal)]" /> All
                      </a>
                    )
                  }
                  return (
                    <a
                      key={r.value}
                      href={makeAnalyticsHref(normalizedFilters, { range: r.value, from: undefined, to: undefined })}
                      className={`rounded-md border px-3 py-2 transition ${range === r.value && !isCustom ? 'border-white bg-white text-black' : 'border-white/10 text-zinc-300 hover:bg-white/10'}`}
                    >
                      {r.label}
                    </a>
                  )
                })}
              </div>

              {fullHistory ? (
                <form
                  method="get"
                  className={`mt-3 grid gap-2 rounded-lg border bg-black/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center ${isCustom ? 'border-[var(--signal)]/50' : 'border-white/10'}`}
                >
                  {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
                  {selectedPageId ? <input type="hidden" name="page" value={selectedPageId} /> : null}
                  {selectedAction && selectedAction !== 'all' ? <input type="hidden" name="action" value={selectedAction} /> : null}
                  {selectedTraffic !== 'all' ? <input type="hidden" name="traffic" value={selectedTraffic} /> : null}
                  <input
                    type="date"
                    name="from"
                    defaultValue={historyWindow.from ?? ''}
                    aria-label="From date"
                    className="min-w-0 rounded bg-transparent px-1 py-1 text-xs text-zinc-200 outline-none [color-scheme:dark]"
                  />
                  <span className="hidden text-xs text-zinc-500 sm:inline">to</span>
                  <input
                    type="date"
                    name="to"
                    defaultValue={historyWindow.to ?? ''}
                    aria-label="To date"
                    className="min-w-0 rounded bg-transparent px-1 py-1 text-xs text-zinc-200 outline-none [color-scheme:dark]"
                  />
                  <button
                    type="submit"
                    className={`rounded-md px-3 py-2 text-xs transition ${isCustom ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/10'}`}
                  >
                    Apply
                  </button>
                </form>
              ) : (
                <a
                  href={appUrl(`/dashboard/billing?plan=${minPlanForFeature('analyticsHistory').id}`)}
                  className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] p-3 text-xs text-zinc-300 transition hover:bg-[var(--signal)]/12"
                >
                  <Lock className="size-3.5 shrink-0 text-[var(--signal)]" />
                  <span>Custom date ranges &amp; all-time history are on <span className="font-medium text-white">Pro</span> - upgrade to unlock.</span>
                </a>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--signal)]">Analytics view</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{pageViewTitle}</h2>
              <p className="mt-2 text-sm text-zinc-400">{pageViewSubtitle}</p>
              {selectedPage ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={agentRuntimeUrl(`/${selectedPage.slug}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
                  >
                    Public listing
                    <ArrowUpRight className="size-4" />
                  </a>
                  <a
                    href={`/dashboard/${selectedPage.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
                  >
                    Edit listing
                    <ArrowUpRight className="size-4" />
                  </a>
                  <a
                    href="/dashboard/analytics"
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    View all listings
                  </a>
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <MiniStat label="Scope" value={selectedPage ? 'Single listing' : 'Workspace'} />
              <MiniStat label="Offers" value={offerCount.toLocaleString(locale)} />
              <MiniStat label="Readiness" value={`${selectedPageReadiness}%`} />
            </div>
          </div>
        </section>

        {insightSentence ? (
          <p className="mt-6 flex items-start gap-2 rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/[0.06] px-4 py-3 text-sm text-zinc-200">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--signal)]" />
            <span>{insightSentence}</span>
          </p>
        ) : null}

        <section className="mt-4 grid gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[minmax(0,1fr)_repeat(2,minmax(170px,0.35fr))] md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--signal)]">Measurement quality</p>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Totals include visible legacy history. Verified coverage shows the share captured through replay-protected server ingestion.
            </p>
          </div>
          <TrustCoverage label="Activity events" trust={eventTrust} locale={locale} />
          <TrustCoverage label="Traffic visits" trust={visitTrust} locale={locale} />
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi title="Observed Signals" value={trackedSignals.toLocaleString(locale)} delta={signalsDelta} note={analyticsRollup ? 'Exact total for this filtered window' : 'Recent sample while exact totals are unavailable'} tone="strong" />
          <Kpi title="AI Agent Visits" value={agentPageVisits.toLocaleString(locale)} delta={agentVisitsDelta} note={`${trafficSplit.human} human/unknown visits`} />
          <Kpi title="Discovery Clicks" value={discoveryClicks.toLocaleString(locale)} note="Directory + Marketplace clickthroughs" />
          <Kpi
            title="Paid Checkout Rate"
            value={conversionRate}
            delta={conversionDelta}
            note={funnel.attributionComplete
              ? `${conversionCount} paid direct orders from ${checkoutStartCount} checkout starts`
              : 'Paid orders and starts do not fully overlap in this window'}
          />
          <Kpi title="Most Active Offer" value={popularService} note={`${offerCount || 0} offers listed`} />
          <Kpi title="Gross Sales" value={money(revenueCents)} delta={revenueDelta} note={`${money(refundedCents)} refunded · ${money(agentShareCents)} recorded fees`} tone="strong" />
          <Kpi title="Paid Orders" value={(analyticsRollup?.counts.paidOrders ?? filteredOrders.length).toLocaleString(locale)} note={`${channelBreakdown.length} active commerce ${channelBreakdown.length === 1 ? 'channel' : 'channels'}`} />
          <Kpi
            title="Negotiations"
            value={(analyticsRollup?.counts.negotiations ?? negotiationSummary.total).toLocaleString(locale)}
            note={`${analyticsRollup?.counts.openNegotiations ?? negotiationSummary.open + negotiationSummary.proposed + negotiationSummary.held} open · ${analyticsRollup?.counts.completedNegotiations ?? negotiationSummary.complete} complete`}
            tone={(analyticsRollup?.counts.openNegotiations ?? negotiationSummary.open) > 0 ? 'strong' : undefined}
          />
        </section>

        <AnalyticsActions
          selectedPage={selectedPage}
        />

        <section className="mt-5 grid gap-5 xl:grid-cols-3">
          <Panel title={`Agent Traffic Over Time (${range === 'today' ? 'Today' : range === '1d' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'All Time'})`}>
            <TrafficChart data={dailySeries} />
            <div className="mt-2 flex gap-4 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[var(--fg-muted)]" /> Total Signals
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[var(--signal)]" /> Agent Visits
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[var(--amber)]" /> Discovery
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[var(--ready)]" /> Conversions
              </div>
            </div>
          </Panel>

          <Panel title="AI vs Human Traffic">
            <TrafficSplit split={trafficSplit} />
          </Panel>

          <Panel title="Agent Type Breakdown">
            <AgentTypeList rows={agentTypeBreakdown} />
          </Panel>

          <Panel title="Paid Order Sources">
            <OrderChannelList rows={channelBreakdown} total={analyticsRollup?.counts.paidOrders ?? filteredOrders.length} />
          </Panel>

          <Panel title="Top Offers">
            {topOffers.length ? (
              <TopOffersChart offers={topOffers} max={maxOfferEvents} />
            ) : (
              <EmptyPanel message="No offer signals yet." hint="Publish a listing and share its link - as agents discover and act on your offers, the leaders show up here." />
            )}
          </Panel>

          <Panel title={selectedPage ? 'Selected Listing Agent Activity' : 'Top Listings by Agent Activity'}>
            {topPages.length ? (
              <TopPagesChart pages={topPages} max={maxPageEvents} />
            ) : (
              <EmptyPanel message="No listing activity yet." />
            )}
          </Panel>

          <Panel title="Paid Checkout Leaders">
            {conversionLeaders.length ? (
              <div className="space-y-4 pt-1">
                {conversionLeaders.map((offer, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="font-medium text-white truncate pr-2">
                        {offer.name}
                        <span className="ml-2 text-[10px] text-zinc-500 font-normal">/{offer.pageSlug}</span>
                      </div>
                      <div className="font-semibold text-[var(--ready)] shrink-0">{offer.conversionRate}%</div>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[var(--ready)] rounded-full transition-all" 
                        style={{ width: `${Math.min(100, offer.conversionRate)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {offer.conversions} paid / {offer.attempts} attempts
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 pt-2">Not enough conversion data yet.</div>
            )}
          </Panel>

          <Panel title="A/B Tests">
            {abTests.length ? (
              <div className="space-y-5 pt-1">
                {abTests.map((test) => {
                  const maxRate = Math.max(...test.variants.map((v) => v.rate), 0.0001)
                  return (
                    <div key={test.test}>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="uppercase tracking-[0.18em] text-[var(--signal)]">
                          {test.variants[0]?.offerName?.replace(/\s*\(Variant [A-Z]\)$/, '') || 'Experiment'}
                        </span>
                        {test.slug ? <span className="text-[10px] text-zinc-500">/{test.slug}</span> : null}
                      </div>
                      <div className="space-y-3">
                        {test.variants.map((v) => {
                          const isWinner = test.winnerLabel === v.label
                          return (
                            <div key={v.label}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <div className="truncate pr-2 text-white">
                                  <span className={`mr-2 rounded px-1.5 py-px text-[10px] font-semibold ${isWinner ? 'bg-[var(--ready)]/15 text-[var(--ready)]' : 'bg-white/10 text-zinc-300'}`}>
                                    {v.label}{isWinner ? ' · winning' : ''}
                                  </span>
                                  <span className="text-zinc-400">{v.offerName}</span>
                                </div>
                                <div className={`shrink-0 font-semibold ${isWinner ? 'text-[var(--ready)]' : 'text-zinc-200'}`}>
                                  {(v.rate * 100).toFixed(1)}%
                                </div>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className={`h-full rounded-full transition-all ${isWinner ? 'bg-[var(--ready)]' : 'bg-[var(--signal)]'}`}
                                  style={{ width: `${Math.min(100, (v.rate / maxRate) * 100)}%` }}
                                />
                              </div>
                              <div className="mt-0.5 text-[10px] text-zinc-500">
                                {v.conversions} checkout handoffs / {v.impressions} impressions
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <p className="text-[11px] text-zinc-500">
                  Handoff rate = provider redirects or hosted checkout starts ÷ impressions. Paid orders are reported separately above.
                </p>
                {events.length === 500 ? (
                  <p className="text-[11px] text-[var(--amber)]">
                    Experiment detail uses the latest 500 matching activity rows. Headline totals and paid-order reporting remain exact.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 pt-2">
                No A/B tests running. In the builder, duplicate an offer to split traffic across variants and compare here.
              </div>
            )}
          </Panel>

          <Panel title="Conversion Funnel">
            <ConversionFunnel
              visits={funnel.listingVisits}
              attempts={attemptCount}
              starts={checkoutStartCount}
              paid={conversionCount}
              retained={funnel.retainedDirectOrders}
              attributionComplete={funnel.attributionComplete}
            />
          </Panel>

          <Panel title="Discovery ROI">
            {discoveryClicks ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-[var(--amber)]/20 bg-[var(--amber)]/10 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--amber)]">Click to intent</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{discoveryToIntentRate == null ? '—' : `${discoveryToIntentRate}%`}</div>
                  <p className="mt-1 text-xs text-zinc-400">
                    Directional ratio of checkout attempts to discovery clicks in this filtered period; not a joined journey conversion.
                  </p>
                </div>
                <DiscoveryList title="Top actions" rows={discoveryActions} />
                <DiscoveryList title="Surfaces" rows={discoverySurfaces} />
              </div>
            ) : (
              <EmptyPanel message="No discovery clicks yet." />
            )}
          </Panel>

          <Panel title="Demand Insights - what agents asked">
            {topQueries.length || topReferrers.length ? (
              <div className="space-y-4 text-sm">
                {topQueries.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--signal)]">Top agent queries</div>
                    <ul className="mt-2 space-y-1">
                      {topQueries.map((q) => (
                        <li key={q.query} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-3 py-1.5">
                          <span className="truncate text-zinc-200">{q.query}</span>
                          <span className="shrink-0 rounded-full bg-[var(--signal)]/10 px-2 py-0.5 text-xs text-[var(--signal)]">{q.count}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Search intent for offers.
                    </p>
                  </div>
                )}
                {unservedQueries.length > 0 && (
                  <div className="rounded-lg border border-[var(--amber)]/20 bg-[var(--amber)]/5 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--amber)]">Gaps - searched but not offered</div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {unservedQueries.map((q) => (
                        <li key={q.query} className="rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-2.5 py-0.5 text-xs text-[var(--amber)]">
                          {q.query} <span className="text-[var(--amber)]/70">×{q.count}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Add or rename offers.
                    </p>
                  </div>
                )}
                {topReferrers.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--signal)]">Top referrers</div>
                    <ul className="mt-2 space-y-1">
                      {topReferrers.map((r) => (
                        <li key={r.query} className="flex items-center justify-between gap-3 text-zinc-300">
                          <span className="truncate font-mono text-xs">{r.query}</span>
                          <span className="shrink-0 text-xs text-zinc-500">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <EmptyPanel message="No agent queries yet." hint="The questions agents ask about your offers land here - a goldmine for sharpening your copy once traffic arrives." />
            )}
          </Panel>

        </section>

        {/* Phase 2: Key Insights */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 text-zinc-200">Key Insights</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <div className="text-sm text-zinc-400">Agent-engaged quality</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-white">{avgActiveReadiness}</span>
                <span className="text-sm text-zinc-400">avg readiness</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Observed engaged-listing average vs workspace ({avgAllReadiness}%)
              </div>
              {avgActiveReadiness > avgAllReadiness && (
                <div className="mt-2 text-xs text-[var(--ready)]">Higher readiness is correlated with observed activity</div>
              )}
            </div>

            <Insight
              title="Agent-engaged listings"
              value={`${agentEngagedPageCount} / ${ownedPages.length}`}
              detail="Listings with agent traffic"
            />

            <Insight
              title="AI agent listing visits"
              value={String(agentPageVisits)}
              detail="Classified AI reads"
            />

            <Insight
              title="Readiness trend"
              value={`${readinessTrend.currentAverage}%`}
              detail={`${formatTrendDelta(readinessTrend.delta)} from ${readinessTrend.versionSnapshots || ownedPages.length} listing snapshots`}
            />

            <Insight
              title="Discovery clickthroughs"
              value={String(discoveryClicks)}
              detail="Directory + marketplace"
            />

            <Insight
              title="Agent-readable surface"
              value={`${ownedPages.filter((page) => page.is_published).length}/${ownedPages.length}`}
              detail="Published discovery feeds"
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
                  <th className="px-5 py-3 font-medium">Listing</th>
                  <th className="px-5 py-3 font-medium">Capture</th>
                  <th className="px-5 py-3 text-right font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recentAgentVisitLogs.map((visit) => (
                  <tr key={visit.id} className="border-t border-white/10">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <Bot className="size-4 text-[var(--signal)]" />
                        {visit.agent_type}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-600">{formatEventDate(visit.created_at, locale)}</span>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      <span className="line-clamp-1">{formatVisitQuery(visit)}</span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-[var(--signal)]">/{visit.slug}</td>
                    <td className="px-5 py-4"><TrustBadge verified={visit.trust_level === 'verified_server'} /></td>
                    <td className="px-5 py-4 text-right text-[var(--ready)]">{Math.round(Number(visit.confidence_score || 0))}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentAgentVisitLogs.length ? (
              <div className="p-10 text-center text-sm text-zinc-500">
                No agent query logs yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 card !p-0">
          <div className="flex flex-col justify-between gap-3 border-b border-white/10 p-5 md:flex-row md:items-center">
            <h2 className="text-xl font-semibold">Recent Agent Interactions</h2>
            <p className="text-sm text-zinc-500">
              Latest {Math.min(filteredEvents.length, 10)} of {(analyticsRollup?.counts.events ?? filteredEvents.length).toLocaleString(locale)} matching events
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.04] text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">User-Agent</th>
                  <th className="px-5 py-3 font-medium">Query</th>
                  <th className="px-5 py-3 font-medium">Action Taken</th>
                  <th className="px-5 py-3 font-medium">Capture</th>
                  <th className="px-5 py-3 text-right font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.slice(0, 10).map((event) => (
                  <tr key={event.id} className="border-t border-white/10">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <Bot className="size-4 text-[var(--signal)]" />
                        {getAgentName(event.agent_user_agent)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      <span className="line-clamp-1">{event.query || event.offer_name}</span>
                      <span className="mt-1 block font-mono text-xs text-zinc-600">/{event.slug}</span>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {getEventActionLabel(event.event_type)}
                      <span className="mt-1 block text-xs text-zinc-600">{formatEventDate(event.created_at, locale)}</span>
                    </td>
                    <td className="px-5 py-4"><TrustBadge verified={event.trust_level === 'verified_server'} /></td>
                    <td className="px-5 py-4 text-right text-[var(--signal)]">{getSignalLabel(event)}</td>
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
  delta?: KpiDelta | null
  note?: string
  tone?: 'strong'
}) {
  return (
    <div className={`rounded-lg border border-white/10 p-5 ${tone ? 'bg-[var(--signal)]/15' : 'bg-white/[0.04]'}`}>
      <p className="text-sm text-zinc-300">{title}</p>
      <p className="mt-3 text-4xl font-semibold tracking-tight">{value}</p>
      {delta ? (
        <p
          className={`mt-3 inline-flex items-center gap-1 text-sm ${
            delta.dir === 'up'
              ? 'text-[var(--ready)]'
              : delta.dir === 'down'
                ? 'text-red-300'
                : 'text-zinc-400'
          }`}
        >
          {delta.dir === 'up' ? (
            <ArrowUpRight className="size-4" />
          ) : delta.dir === 'down' ? (
            <ArrowDownRight className="size-4" />
          ) : (
            <Minus className="size-4" />
          )}
          {delta.text}
        </p>
      ) : null}
      {note ? <p className="mt-3 text-sm text-zinc-400">{note}</p> : null}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}

function TrafficSplit({ split }: { split: ReturnType<typeof getTrafficSplit> }) {
  const aiShare = split.total ? Math.round((split.ai / split.total) * 100) : 0
  const humanShare = split.total ? Math.round((split.human / split.total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-full border border-white/10 bg-black/30">
        <div className="h-3 bg-gradient-to-r from-[var(--ready)] via-[var(--signal)] to-[var(--signal)]" style={{ width: `${aiShare}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/10 p-3">
          <p className="text-xs text-[var(--signal)]">AI agents</p>
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
            <span className="font-mono text-[var(--signal)]">{row.total}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[var(--signal)]" style={{ width: `${Math.min(100, Math.round(row.avgConfidence))}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">{Math.round(row.avgConfidence)}% average confidence</p>
        </div>
      ))}
    </div>
  )
}

function TrustCoverage({
  label,
  trust,
  locale,
}: {
  label: string
  trust: ReturnType<typeof summarizeAnalyticsTrust>
  locale: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="font-mono text-sm text-white">{trust.verifiedPercent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[var(--ready)]" style={{ width: `${trust.verifiedPercent}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {trust.verified.toLocaleString(locale)} verified · {(trust.legacy + trust.unverified).toLocaleString(locale)} historical/unverified
      </p>
    </div>
  )
}

function OrderChannelList({
  rows,
  total,
}: {
  rows: Array<{ channel: string; label: string; orders: number }>
  total: number
}) {
  if (!rows.length) return <EmptyPanel message="No paid order channels in this range." />

  return (
    <div className="space-y-3">
      {rows.slice(0, 7).map((row) => {
        const share = total ? Math.round((row.orders / total) * 100) : 0
        return (
          <div key={row.channel} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="capitalize text-zinc-200">{row.label}</span>
              <span className="font-mono text-[var(--signal)]">{row.orders}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[var(--signal)]" style={{ width: `${share}%` }} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">{share}% of paid orders</p>
          </div>
        )
      })}
    </div>
  )
}

function TrustBadge({ verified }: { verified: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${
      verified
        ? 'border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]'
        : 'border-white/10 bg-white/[0.04] text-zinc-500'
    }`}>
      {verified ? 'Verified' : 'Historical'}
    </span>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] p-5">
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
        className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-200 outline-none focus:border-[var(--signal)]/60"
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

function EmptyPanel({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 p-6 text-center">
      <Sparkles className="size-5 text-[var(--signal)]/60" aria-hidden />
      <p className="text-sm text-zinc-400">{message}</p>
      {hint ? <p className="max-w-xs text-xs text-zinc-500">{hint}</p> : null}
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
            <span className="font-mono text-[var(--signal)]">{row.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function mergeVisitCountsIntoDailySeries(series: ReturnType<typeof getDailyEventSeries>, visits: AgentVisit[]) {
  const visitCounts = new Map<string, { total: number; ai: number }>()

  for (const visit of visits) {
    const dateKey = formatUtcDateKey(new Date(visit.created_at))
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

function mergePaidOrdersIntoDailySeries(
  series: ReturnType<typeof getDailyEventSeries>,
  orders: DirectFinanceRow[],
) {
  const byDate = new Map(series.map((point) => [point.dateKey, point]))
  for (const point of series) point.conversions = 0
  for (const order of orders) {
    const point = byDate.get(formatUtcDateKey(new Date(order.created_at)))
    if (point) point.conversions += 1
  }
  return series
}

function formatUtcDateKey(date: Date) {
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''
}

function makeAnalyticsHref(current: AnalyticsSearchParams, overrides: Partial<AnalyticsSearchParams>) {
  const next = { ...current, ...overrides }
  const params = new URLSearchParams()

  // A custom from/to range takes precedence over the preset range.
  if (next.from || next.to) {
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
  } else if (next.range && next.range !== '30d') {
    params.set('range', next.range)
  }
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
