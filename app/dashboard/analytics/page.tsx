import { ArrowLeft, ArrowUpRight, Bot, Download, Filter, Search } from 'lucide-react'
import { AgentPage, getOfferCount } from '../../../lib/agent-page'
import {
  filterAnalyticsEvents,
  formatEventDate,
  getAgentName,
  getCheckoutAttemptCount,
  getConversionCount,
  getDailyEventSeries,
  getPageOptions,
  getPipelineCents,
  getRevenueCents,
  getSignalLabel,
  getTopOfferStats,
} from '../../../lib/analytics'
import { formatUsdCents } from '../../../lib/checkout'
import { CheckoutEvent, getEventActionLabel } from '../../../lib/checkout-events'
import { createClient } from '../../../utils/supabase/server'
import { cookies } from 'next/headers'

type AnalyticsPageProps = {
  searchParams: Promise<{ q?: string; page?: string; action?: string }>
}

const actionOptions = [
  ['all', 'All actions'],
  ['checkout_view', 'Checkout views'],
  ['checkout_attempt', 'Checkout attempts'],
  ['provider_redirect', 'Provider redirects'],
  ['stripe_session_created', 'Stripe sessions'],
  ['stripe_missing_config', 'Config issues'],
  ['stripe_error', 'Stripe errors'],
]

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const filters = await searchParams
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

  const { data: pages } = await supabase
    .from('pages')
    .select('*')
    .eq('owner_id', user.id)
    .returns<AgentPage[]>()

  const { data: checkoutEvents } = await supabase
    .from('checkout_events')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(250)
    .returns<CheckoutEvent[]>()

  const events = checkoutEvents ?? []
  const ownedPages = pages ?? []
  const pageOptions = getPageOptions(ownedPages)
  const selectedPage = pageOptions.find((page) => page.id === filters.page)
  const selectedAction = actionOptions.some(([value]) => value === filters.action) ? filters.action : 'all'
  const filteredEvents = filterAnalyticsEvents(events, {
    query: filters.q,
    pageId: filters.page,
    action: selectedAction,
  })
  const offerCount = ownedPages.reduce((sum, page) => sum + getOfferCount(page), 0)
  const attemptCount = getCheckoutAttemptCount(filteredEvents)
  const conversionCount = getConversionCount(filteredEvents)
  const conversionRate = filteredEvents.length
    ? ((conversionCount / Math.max(attemptCount || filteredEvents.length, 1)) * 100).toFixed(1)
    : '0.0'
  const revenueCents = getRevenueCents(filteredEvents)
  const pipelineCents = getPipelineCents(filteredEvents)
  const popularService = getTopOfferStats(filteredEvents)[0]?.name || 'No offer activity yet'
  const dailySeries = getDailyEventSeries(filteredEvents, 10)
  const topOffers = getTopOfferStats(filteredEvents).slice(0, 5)
  const maxDailyEvents = Math.max(...dailySeries.map((point) => point.total), 1)
  const maxOfferEvents = Math.max(...topOffers.map((offer) => offer.total), 1)
  const exportParams = new URLSearchParams()

  if (filters.q) exportParams.set('q', filters.q)
  if (filters.page) exportParams.set('page', filters.page)
  if (selectedAction && selectedAction !== 'all') exportParams.set('action', selectedAction)

  const exportHref = `/api/analytics/export${exportParams.toString() ? `?${exportParams}` : ''}`

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
            Dashboard
          </a>
          <div className="flex items-center gap-3">
            <a href={exportHref} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10">
              <Download className="size-4" />
              Export CSV
            </a>
          </div>
        </div>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight">Analytics Dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          Track real agent-facing intent: checkout views, dry-run simulations, provider handoffs, and Stripe checkout sessions.
        </p>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi title="Tracked Agent Events" value={filteredEvents.length.toLocaleString()} note={`${events.length} total stored`} tone="strong" />
          <Kpi title="Conversion Rate" value={`${conversionRate}%`} note={`${conversionCount} conversion actions`} />
          <Kpi title="Most Active Offer" value={popularService} note={`${offerCount || 0} offers listed`} />
          <Kpi title="Tracked Revenue" value={formatUsdCents(revenueCents)} note={`${formatUsdCents(pipelineCents)} pipeline`} tone="strong" />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.85fr_0.48fr]">
          <Panel title="Agent Traffic Over Time">
            <div className="relative h-64">
              <div className="absolute inset-x-0 top-6 border-t border-dashed border-white/10" />
              <div className="absolute inset-x-0 top-24 border-t border-dashed border-white/10" />
              <div className="absolute inset-x-0 top-44 border-t border-dashed border-white/10" />
              <div className="absolute inset-x-0 bottom-0 flex h-52 items-end gap-2">
                {dailySeries.map((point) => (
                  <div key={point.dateKey} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="relative w-full rounded-t-lg bg-gradient-to-t from-cyan-300/20 to-cyan-300"
                      style={{ height: point.total ? `${Math.max(8, (point.total / maxDailyEvents) * 100)}%` : '3%' }}
                    />
                    <span className="hidden text-xs text-zinc-600 sm:inline">{point.label}</span>
                  </div>
                ))}
              </div>
              <div className="absolute left-5 top-10 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm shadow-xl">
                {filteredEvents.length ? `${filteredEvents.length} signals` : 'No signals yet'}
                <span className="block text-cyan-200">{conversionCount} conversions</span>
              </div>
            </div>
          </Panel>

          <Panel title="Top Offers">
            {topOffers.length ? (
              <div className="space-y-4">
                {topOffers.map((offer) => (
                  <div key={`${offer.pageSlug}-${offer.name}`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-white">{offer.name}</p>
                        <p className="font-mono text-xs text-zinc-500">/{offer.pageSlug}</p>
                      </div>
                      <p className="text-cyan-200">{offer.total}</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-300"
                        style={{ width: `${Math.max(7, (offer.total / maxOfferEvents) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {offer.attempts} attempts, {offer.conversions} conversions
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel message="No offer signals yet. Run a simulator dry-run or open a checkout page." />
            )}
          </Panel>

          <form action="/dashboard/analytics" className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
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
            </div>
            <button className="mt-5 w-full rounded-lg bg-cyan-300 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-200">
              Apply filters
            </button>
            {(filters.q || filters.page || (selectedAction && selectedAction !== 'all')) ? (
              <a href="/dashboard/analytics" className="mt-3 block text-center text-sm text-zinc-500 hover:text-white">
                Clear filters
              </a>
            ) : null}
          </form>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-3">
          <Insight
            title="Selected page"
            value={selectedPage?.label || 'All pages'}
            detail={selectedPage ? `/${selectedPage.slug}` : `${ownedPages.length} pages included`}
          />
          <Insight
            title="Intent actions"
            value={String(attemptCount)}
            detail="Checkout starts and simulator dry-runs"
          />
          <Insight
            title="Agent-readable surface"
            value={`${ownedPages.filter((page) => page.is_published).length}/${ownedPages.length}`}
            detail="Published pages in discovery feeds"
          />
        </section>

        <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.04]">
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
