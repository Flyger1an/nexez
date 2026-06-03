'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  Copy,
  CreditCard,
  ExternalLink,
  Gauge,
  Grid2X2,
  Handshake,
  Link2,
  LogOut,
  Pencil,
  Play,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import {
  AgentPage,
  BASIC_OWNER_PAGE_SELECT,
  OWNER_PAGE_SELECT,
  getBaseUrl,
  getOfferCount,
  getReadinessScore,
} from '../../lib/agent-page'
import { AgentVisit, getAgentTypeBreakdown, getTopPagesByAgentVisits, getTrafficSplit } from '../../lib/agent-visits'
import { CheckoutEvent, getEventActionLabel } from '../../lib/checkout-events'
import { createClient } from '../../utils/supabase/client'

export default function Dashboard() {
  const [pages, setPages] = useState<AgentPage[]>([])
  const [events, setEvents] = useState<CheckoutEvent[]>([])
  const [agentVisits, setAgentVisits] = useState<AgentVisit[]>([])
  const [openNegotiations, setOpenNegotiations] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    loadPages()
  }, [])

  const publishedCount = pages.filter((page) => page.is_published).length
  const averageReadiness = pages.length
    ? Math.round(pages.reduce((sum, page) => sum + getReadinessScore(page), 0) / pages.length)
    : 0
  const totalOffers = pages.reduce((sum, page) => sum + getOfferCount(page), 0)
  const trafficSplit = useMemo(() => getTrafficSplit(agentVisits), [agentVisits])
  const agentTypeBreakdown = useMemo(() => getAgentTypeBreakdown(agentVisits).slice(0, 4), [agentVisits])
  const topAgentPages = useMemo(() => getTopPagesByAgentVisits(agentVisits, pages).slice(0, 4), [agentVisits, pages])
  const totalTrackedSignals = events.length + agentVisits.length
  const agentPageVisits = trafficSplit.ai
  const discoveryClicks = events.filter((event) => event.event_type === 'directory_click').length
  const checkoutAttempts = events.filter((event) => event.event_type === 'checkout_attempt').length
  const conversionActions = events.filter((event) =>
    ['provider_redirect', 'stripe_session_created'].includes(event.event_type),
  ).length
  const topOffer = getTopOffer(events)
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
  const filteredPages = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return pages

    return pages.filter((page) =>
      [page.name, page.slug, page.description, page.location]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [pages, query])

  async function loadPages() {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login?next=/dashboard'
      return
    }

    const [pageResult, eventResult, visitResult] = await Promise.all([
      fetchOwnedPages(supabase, user.id),
      supabase
        .from('checkout_events')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<CheckoutEvent[]>(),
      fetchAgentVisits(supabase, user.id),
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

    // Count proposals that still need owner attention (graceful if table missing).
    const { count, error: negotiationError } = await supabase
      .from('agent_negotiations')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .in('status', ['negotiation', 'agreement_proposed', 'held'])

    if (negotiationError) {
      if (!isMissingRelationError(negotiationError)) {
        console.warn('Failed to count negotiations:', negotiationError)
      }
      setOpenNegotiations(0)
    } else {
      setOpenNegotiations(count ?? 0)
    }

    setLoading(false)
  }

  async function togglePublished(id: string, currentStatus: boolean) {
    const supabase = createClient()
    await supabase.from('pages').update({ is_published: !currentStatus }).eq('id', id)
    loadPages()
  }

  async function deletePage(id: string) {
    if (!confirm('Delete this agent page?')) return

    const supabase = createClient()
    await supabase.from('pages').delete().eq('id', id)
    loadPages()
  }

  async function copyUrl(slug: string) {
    await navigator.clipboard.writeText(`${getBaseUrl()}/${slug}`)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-white">
        Loading dashboard...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl border-x border-white/10">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0F0D18] p-5 lg:block dashboard-sidebar">
          <a href="/" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#00F5FF]">
              <span className="text-lg font-bold text-[#0A0A0F]">N</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">Nexez</span>
          </a>

          <nav className="mt-10 space-y-1">
            <NavItem active href="/dashboard" icon={<Grid2X2 className="size-4" />} label="My Agent Pages" />
            <NavItem href="/create" icon={<Bot className="size-4" />} label="Builder" />
            <NavItem href="/dashboard/analytics" icon={<BarChart3 className="size-4" />} label="Analytics" />
            <NavItem href="/marketplace" icon={<Search className="size-4" />} label="Marketplace" />
            <NavItem href="/directory" icon={<Search className="size-4" />} label="Directory" />
            <NavItem href="/dashboard/competitors" icon={<BarChart3 className="size-4" />} label="Competitor Intel" />
            <NavItem href="/dashboard/negotiations" icon={<Handshake className="size-4" />} label="Negotiations" badge={openNegotiations} />
            <NavItem href="/simulator" icon={<Bot className="size-4" />} label="Simulator" />
            <NavItem href="/dashboard/integrations" icon={<Link2 className="size-4" />} label="Integrations" />
            <NavItem href="/dashboard/tools" icon={<Bot className="size-4" />} label="Tools" />
            <NavItem href="/dashboard/billing" icon={<CreditCard className="size-4" />} label="Billing" />
            <NavItem href="/dashboard/settings" icon={<Settings className="size-4" />} label="Settings" />
          </nav>

          <div className="mt-10 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
            <p className="text-sm font-medium text-cyan-100">Agent visibility</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Published pages are included in your sitemap and llms.txt feed.
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-col gap-3 border-b border-white/10 bg-[#0F0D18] px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <div className="min-w-0">
              <p className="text-sm text-[#9CA3AF]">Nexez • Dashboard</p>
              <h1 className="truncate text-2xl font-semibold tracking-tight">My Agent Pages</h1>
            </div>
            <div className="flex items-center gap-3">
              <a href="/create" className="btn-primary text-sm">
                <Plus className="size-4" />
                New Agent Page
              </a>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="rounded-lg border border-white/10 p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </header>

          <div className="px-5 py-6 md:px-8">
            <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
              <div className="relative p-6 md:p-8">
                <div className="absolute right-8 top-8 hidden size-32 rounded-full bg-cyan-300/25 blur-3xl md:block" />
                <p className="text-sm text-cyan-200">Your Nexez agent pages received</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  {agentPageVisits} AI agent visits, {trafficSplit.human} human visits, {discoveryClicks} discovery clicks, and {conversionActions} conversion actions
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  {totalTrackedSignals} total tracked signals across {publishedCount} published pages and {totalOffers} listed offers.
                  Agent detection, directory discovery, and marketplace clicks now roll into this ROI view.
                </p>
                {topOffer ? (
                  <p className="mt-4 inline-flex rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                    Top signal: {topOffer}
                  </p>
                ) : null}
              </div>
            </section>

            {openNegotiations > 0 && (
              <a
                href="/dashboard/negotiations"
                className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-[#7C3AED]/40 bg-[#7C3AED]/10 px-5 py-4 transition hover:bg-[#7C3AED]/20"
              >
                <span className="flex items-center gap-3 text-sm">
                  <Handshake className="size-5 text-[#A78BFA]" />
                  <span>
                    <span className="font-semibold text-white">
                      {openNegotiations} negotiation{openNegotiations === 1 ? '' : 's'} need
                      {openNegotiations === 1 ? 's' : ''} your attention
                    </span>
                    <span className="ml-2 text-zinc-300">Review agent proposals and respond.</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-[#A78BFA]">Open inbox →</span>
              </a>
            )}

            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="kpi-card">
                <p className="text-sm text-[#9CA3AF]">Tracked signals</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter">{totalTrackedSignals}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[#9CA3AF]">AI agent visits</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter text-emerald-300">{agentPageVisits}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[#9CA3AF]">Discovery clicks</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter text-amber-300">{discoveryClicks}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[#9CA3AF]">Checkout attempts</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter">{checkoutAttempts}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[#9CA3AF]">Conversion actions</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter text-[#10B981]">{conversionActions}</p>
              </div>
              <div className="kpi-card">
                <p className="text-sm text-[#9CA3AF]">Avg Readiness</p>
                <p className="mt-2 text-4xl font-semibold tracking-tighter">{averageReadiness}%</p>
              </div>
            </section>

            <AgentDetectionSummary trafficSplit={trafficSplit} breakdown={agentTypeBreakdown} topPages={topAgentPages} />

            <RecentActivity events={events} pages={pages} />

            <section className="mt-6 flex flex-col gap-3 md:flex-row">
              <label className="relative flex-1">
                <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 w-full rounded-lg border border-cyan-300/30 bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-cyan-300/70"
                  placeholder="Search pages..."
                />
              </label>
              <a
                href="/create"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-cyan-300 px-8 text-sm font-semibold text-zinc-950 hover:bg-cyan-200"
              >
                Build page
              </a>
            </section>

            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-cyan-200">My Agent Pages</h2>
              <a href="/llms.txt" className="font-mono text-xs text-zinc-500 hover:text-cyan-200">
                /llms.txt
              </a>
            </div>

            <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredPages.map((page) => (
                <PageCard
                  key={page.id}
                  page={page}
                  eventCount={signalsByPageId.get(page.id) ?? 0}
                  onCopy={() => copyUrl(page.slug)}
                  onDelete={() => deletePage(page.id)}
                  onToggle={() => togglePublished(page.id, page.is_published)}
                />
              ))}
            </section>

            {!filteredPages.length ? (
              <div className="mt-5 rounded-lg border border-dashed border-white/15 p-12 text-center">
                <p className="text-zinc-400">
                  {pages.length ? 'No pages match your search.' : 'No pages yet. Create the first AI-readable offer.'}
                </p>
              </div>
            ) : null}
          </div>
        </section>
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

function NavItem({
  active,
  href,
  icon,
  label,
  badge,
}: {
  active?: boolean
  href: string
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
        active ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge && badge > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#7C3AED] px-1.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </a>
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
      <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">AI detection</p>
        <h2 className="mt-2 text-xl font-semibold">Traffic split</h2>
        <div className="mt-5 overflow-hidden rounded-full border border-white/10 bg-black/30">
          <div className="h-3 bg-gradient-to-r from-[#00F5FF] to-[#7C3AED]" style={{ width: `${aiShare}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-zinc-500">AI agents</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-100">{trafficSplit.ai}</p>
            <p className="mt-1 text-xs text-zinc-500">{aiShare}% of visits</p>
          </div>
          <div>
            <p className="text-zinc-500">Human/unknown</p>
            <p className="mt-1 text-2xl font-semibold text-white">{trafficSplit.human}</p>
            <p className="mt-1 text-xs text-zinc-500">{humanShare}% of visits</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[#C4B5FD]">Agent types</p>
        <h2 className="mt-2 text-xl font-semibold">Who is parsing you</h2>
        <div className="mt-4 space-y-3">
          {breakdown.length ? (
            breakdown.map((row) => (
              <div key={row.agentType} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-zinc-200">{row.agentType}</span>
                  <span className="font-mono text-cyan-200">{row.total}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{Math.round(row.avgConfidence)}% avg confidence</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-zinc-500">
              No AI agent visits classified yet.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Top pages</p>
        <h2 className="mt-2 text-xl font-semibold">Most agent-readable</h2>
        <div className="mt-4 space-y-3">
          {topPages.length ? (
            topPages.map((page) => (
              <a
                key={page.pageId}
                href={`/${page.slug}`}
                className="block rounded-lg border border-white/10 bg-black/20 px-3 py-2 hover:border-cyan-300/40"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="line-clamp-1 text-zinc-200">{page.name}</span>
                  <span className="font-mono text-emerald-200">{page.total}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-cyan-200">/{page.slug}</p>
              </a>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-zinc-500">
              Publish and visit a page with an agent crawler user-agent to populate this list.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function PageCard({
  page,
  eventCount,
  onCopy,
  onDelete,
  onToggle,
}: {
  page: AgentPage
  eventCount: number
  onCopy: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const score = getReadinessScore(page)

  return (
    <article className="card overflow-hidden p-0">
      <div className="flex items-start justify-between border-b border-white/10 p-5">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-white/5">
          <Bot className="size-5 text-[#C4B5FD]" />
        </div>
        <button
          onClick={onToggle}
          className={`rounded-full px-3 py-0.5 text-xs font-medium tracking-wide transition ${
            page.is_published 
              ? 'badge-published' 
              : 'badge-draft'
          }`}
        >
          {page.is_published ? 'Published' : 'Draft'}
        </button>
      </div>

      <div className="p-5">
        <h3 className="line-clamp-1 text-lg font-semibold">{page.name}</h3>
        <p className="mt-1 font-mono text-xs text-cyan-200">/{page.slug}</p>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
          {page.description || 'No AI summary yet.'}
        </p>

        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <span>{getOfferCount(page)} offers</span>
          <span className="inline-flex items-center gap-1 text-cyan-200">
            <Gauge className="size-3" />
            {score}% ready
          </span>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
          <Activity className="size-3 text-cyan-200" />
          {eventCount} agent signals
        </div>

        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
          <a href={`/dashboard/${page.id}`} className={actionClass} aria-label="Edit page">
            <Pencil className="size-4" />
          </a>
          <a href={`/dashboard/${page.id}/settings`} className={actionClass} aria-label="Page settings">
            <Settings className="size-4" />
          </a>
          <a href={`/dashboard/${page.id}/test`} className={actionClass} aria-label="Test page with AI agents">
            <Play className="size-4" />
          </a>
          <a href={`/${page.slug}`} className={actionClass} aria-label="Preview page">
            <ExternalLink className="size-4" />
          </a>
          <button onClick={onCopy} className={actionClass} aria-label="Copy page URL">
            <Copy className="size-4" />
          </button>
          <button onClick={onDelete} className={`${actionClass} text-red-300`} aria-label="Delete page">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </article>
  )
}

const actionClass =
  'inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white'

function RecentActivity({ events, pages }: { events: CheckoutEvent[]; pages: AgentPage[] }) {
  const firstPage = pages[0]

  return (
    <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.04]">
      <div className="flex flex-col justify-between gap-3 border-b border-white/10 p-5 md:flex-row md:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Agent activity</p>
          <h2 className="mt-1 text-xl font-semibold">Recent discovery + checkout signals</h2>
        </div>
        <a href="/dashboard/analytics" className="text-sm text-zinc-400 hover:text-cyan-200">
          View analytics
        </a>
      </div>

      {events.length ? (
        <div className="grid divide-y divide-white/10">
          {events.slice(0, 5).map((event) => (
            <div key={event.id} className="grid gap-3 p-5 md:grid-cols-[1.1fr_1fr_0.8fr_0.65fr] md:items-center">
              <div>
                <p className="font-medium text-white">{getEventActionLabel(event.event_type)}</p>
                <p className="mt-1 line-clamp-1 text-sm text-zinc-500">{formatAgentName(event.agent_user_agent)}</p>
              </div>
              <div>
                <p className="line-clamp-1 text-sm text-zinc-300">{event.offer_name}</p>
                <p className="mt-1 font-mono text-xs text-cyan-200">/{event.slug}</p>
              </div>
              <p className="line-clamp-1 text-sm text-zinc-400">
                {event.query || event.referrer || 'No query context'}
              </p>
              <p className="text-sm text-zinc-500 md:text-right">{formatEventTime(event.created_at)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-zinc-400">
            No discovery or checkout activity yet. Share the marketplace, run the agent tester, or open a public
            checkout path to start collecting useful intent signals.
          </p>
          <a
            href={firstPage ? `/dashboard/${firstPage.id}/test` : '/create'}
            className="inline-flex items-center justify-center rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200"
          >
            {firstPage ? 'Test a page' : 'Create a page'}
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

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
