import type { Metadata } from 'next'
import { ArrowRight, Bot, Code2, ExternalLink, Search, Sparkles } from 'lucide-react'
import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getOfferCount, getReadinessScore, getTrustScore } from '../../lib/agent-page'
import { AgentSearchResult, searchAgentPages } from '../../lib/agent-search'
import { supabase } from '../../lib/supabase'
import { CopyButton } from './CopyButton'
import { FavoriteButton } from '../../components/FavoriteButton'
import { TrackedDirectoryLink } from '../../components/TrackedDirectoryLink'

type DirectoryProps = {
  searchParams: Promise<{ q?: string; type?: string; category?: string; min_readiness?: string }>
}

const quickFilters = ['consulting', 'strategy session', 'bookings', 'products', 'retainers']

export const metadata: Metadata = {
  title: 'Agent Marketplace + Directory',
  description: 'Discover and favorite agent-optimized offers. Marketplace for agents + humans.',
}

export default async function DirectoryPage({ searchParams }: DirectoryProps) {
  const { q = '', type = 'all', category: rawCategory = 'all', min_readiness: rawMin = '0' } = await searchParams
  const cleanQuery = q.trim()
  const categoryFilter = (rawCategory === 'professional' || rawCategory === 'consumer') ? rawCategory : 'all'
  const minReadiness = Math.max(0, parseInt(rawMin, 10) || 0)
  const baseUrl = getBaseUrl()
  const { data: pages } = await supabase
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  let filteredPages = pages ?? []
  if (categoryFilter !== 'all') {
    filteredPages = filteredPages.filter(p => {
      const ind = (p.industry || '').toLowerCase()
      const isConsumer = ['home', 'plumbing', 'cleaning', 'massage', 'fitness', 'wellness', 'pet', 'grooming', 'auto', 'detailing', 'beauty', 'medical', 'health', 'events'].some(k => ind.includes(k))
      return categoryFilter === 'consumer' ? isConsumer : !isConsumer
    })
  }

  // Apply minimum readiness filter
  if (minReadiness > 0) {
    filteredPages = filteredPages.filter(p => {
      const score = getReadinessScore({
        ...p,
        products: p.products ?? [],
        services: p.services ?? [],
        faqs: p.faqs ?? [],
        is_published: true,
      })
      return score >= minReadiness
    })
  }

  const allResults = searchAgentPages(filteredPages, cleanQuery, 50)

  const results = allResults.filter((result) => {
    if (type === 'all') return true
    return result.offer?.type === type
  })
  const pageCount = pages?.length ?? 0
  const offerCount = pages?.reduce((sum, page) => sum + getOfferCount(page), 0) ?? 0

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <section className="border-b border-white/10 bg-[#0F0D18]">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex justify-end">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a href="/agent-pages.json" className="btn-secondary inline-flex items-center gap-2">
                <Code2 className="size-4" />
                Agent Index
              </a>
              <a href="/dashboard" className="btn-primary inline-flex items-center gap-2">
                Dashboard
              </a>
            </div>
          </div>

          <div className="grid gap-8 py-8 md:py-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-3 py-1 text-sm font-medium text-[#C4B5FD]">
                <Bot className="size-4" />
                Public Agent Directory
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                Discover AI-ready services and products.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#9CA3AF]">
                Search published Nexez agent pages by buyer intent, then open the public page, agent manifest, or checkout handoff.
              </p>
              <a
                href="/leaderboard"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/20"
              >
                🏆 Agent-Ready Leaderboard
              </a>
            </div>

            <form action="/directory" className="rounded-lg border border-white/10 bg-[#1A1625] p-3">
              <label className="relative block">
                <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  name="q"
                  defaultValue={cleanQuery}
                  className="input h-14 w-full pl-12 pr-4 text-base"
                  placeholder="Search for strategy sessions, bookings, retainers..."
                />
              </label>
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="category" value={categoryFilter} />
              {minReadiness > 0 && <input type="hidden" name="min_readiness" value={String(minReadiness)} />}
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary px-5 py-2.5 text-sm">
                  Search
                </button>
                {quickFilters.map((filter) => (
                  <a
                    key={filter}
                    href={`/directory?q=${encodeURIComponent(filter)}&type=${type}`}
                    className="rounded-lg border border-white/10 bg-[#1A1625] px-3 py-2 text-sm text-[#9CA3AF] hover:border-[#7C3AED]/30 hover:text-white"
                  >
                    {filter}
                  </a>
                ))}
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <div className="card !p-5">
            <p className="text-sm font-semibold text-[#9CA3AF]">Directory stats</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Pages" value={String(pageCount)} />
              <Stat label="Offers" value={String(offerCount)} />
            </div>
          </div>

          <div className="card !p-5">
            <p className="text-sm font-semibold text-[#9CA3AF]">Offer type</p>
            <div className="mt-4 grid gap-2">
              <FilterLink label="All" value="all" active={type === 'all'} query={cleanQuery} currentOther={categoryFilter} />
              <FilterLink label="Services" value="service" active={type === 'service'} query={cleanQuery} currentOther={categoryFilter} />
              <FilterLink label="Products" value="product" active={type === 'product'} query={cleanQuery} currentOther={categoryFilter} />
            </div>
          </div>

          <div className="card !p-5">
            <p className="text-sm font-semibold text-[#9CA3AF]">Category</p>
            <div className="mt-4 grid gap-2">
              <FilterLink label="All" value="all" active={type === 'all'} query={cleanQuery} param="category" currentOther={type} />
              <FilterLink label="Professional" value="professional" active={type === 'professional'} query={cleanQuery} param="category" currentOther={type} />
              <FilterLink label="Consumer / Local" value="consumer" active={type === 'consumer'} query={cleanQuery} param="category" currentOther={type} />
            </div>
          </div>

          <div className="card !p-5">
            <div className="flex items-center gap-2 text-[#00F5FF]">
              <Sparkles className="size-4" />
              <p className="text-sm font-semibold">Agent API</p>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between text-[#9CA3AF] mb-1">
                  <span>Agent search</span>
                  <CopyButton text={`${baseUrl}/api/agent-search?q=${encodeURIComponent(cleanQuery || 'consulting')}`} />
                </div>
                <code className="block break-all rounded bg-[#0A0A0F] p-2 text-[#C4B5FD] font-mono text-[10px]">
                  {`${baseUrl}/api/agent-search?q=${encodeURIComponent(cleanQuery || 'consulting')}`}
                </code>
              </div>
              <div>
                <div className="flex items-center justify-between text-[#9CA3AF] mb-1">
                  <span>Directory API</span>
                  <CopyButton text={`${baseUrl}/api/directory?category=consumer`} />
                </div>
                <code className="block break-all rounded bg-[#0A0A0F] p-2 text-[#C4B5FD] font-mono text-[10px]">
                  {`${baseUrl}/api/directory?category=consumer`}
                </code>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <div className="mb-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p className="text-sm text-[#9CA3AF]">{results.length} matching offers</p>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {cleanQuery 
                    ? `Results for "${cleanQuery}"` 
                    : categoryFilter === 'professional' 
                      ? 'Professional Services' 
                      : categoryFilter === 'consumer' 
                        ? 'Consumer & Local Services' 
                        : 'All agent-ready offers'}
                </h2>
              </div>
              <a href="/openapi.json" className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700 hover:text-cyan-900">
                OpenAPI
                <ExternalLink className="size-4" />
              </a>
            </div>

            {/* Phase 2 Directory polish: Category tabs + Quality filter */}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: 'All', value: 'all' },
                { label: 'Professional', value: 'professional' },
                { label: 'Consumer / Local', value: 'consumer' },
              ].map((tab) => {
                const isActive = categoryFilter === tab.value
                return (
                  <a
                    key={tab.value}
                    href={`/directory?q=${encodeURIComponent(cleanQuery)}&type=${type}&category=${tab.value}`}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-[#7C3AED] text-white'
                        : 'border border-white/10 bg-[#1A1625] text-[#9CA3AF] hover:border-[#7C3AED]/30'
                    }`}
                  >
                    {tab.label}
                  </a>
                )
              })}

              {/* Quick high-quality filter (Phase 2) */}
              <a
                href={`/directory?q=${encodeURIComponent(cleanQuery)}&type=${type}&category=${categoryFilter}&min_readiness=80`}
                className="rounded-full border border-emerald-300/50 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
              >
                High Quality (80%+)
              </a>
              <a
                href={`/directory?q=${encodeURIComponent(cleanQuery)}&type=${type}&category=${categoryFilter}&min_readiness=90`}
                className="rounded-full border border-emerald-300/50 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
              >
                Elite (90%+)
              </a>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {results.map((result) => (
              <DirectoryCard key={`${result.page.slug}-${result.offer?.key ?? 'page'}`} result={result} />
            ))}
          </div>

          {/* Phase 2: Agents also viewed / similar pages */}
          {results.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-semibold tracking-tight mb-4 text-white">Agents also viewed</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {(pages ?? [])
                  .filter(p => p.is_published && ((p.services?.length ?? 0) + (p.products?.length ?? 0) > 0))
                  .filter(p => {
                    const inCurrentResults = results.some(r => r.page.slug === p.slug)
                    if (inCurrentResults) return false

                    // Same broad category
                    const ind = (p.industry || '').toLowerCase()
                    const isConsumer = ['home', 'plumbing', 'cleaning', 'massage', 'fitness', 'wellness', 'pet', 'grooming', 'auto', 'detailing', 'beauty', 'medical', 'health', 'events'].some(k => ind.includes(k))
                    const wantConsumer = categoryFilter === 'consumer'
                    const wantProfessional = categoryFilter === 'professional'

                    if (wantConsumer) return isConsumer
                    if (wantProfessional) return !isConsumer
                    return true
                  })
                  .sort((a, b) => {
                    const scoreA = getReadinessScore({ ...a, products: a.products ?? [], services: a.services ?? [], faqs: a.faqs ?? [], is_published: true })
                    const scoreB = getReadinessScore({ ...b, products: b.products ?? [], services: b.services ?? [], faqs: b.faqs ?? [], is_published: true })
                    return scoreB - scoreA
                  })
                  .slice(0, 4)
                  .map((p) => {
                    const readiness = getReadinessScore({
                      ...p,
                      products: p.products ?? [],
                      services: p.services ?? [],
                      faqs: p.faqs ?? [],
                      is_published: true,
                    });
                    return (
                      <div key={p.slug} className="card !p-4 text-sm">
                        <div className="flex items-start justify-between">
                          <TrackedDirectoryLink
                            href={`/${p.slug}`}
                            slug={p.slug}
                            action="similar_page"
                            className="font-medium text-white hover:text-[#7C3AED]"
                          >
                            {p.name}
                          </TrackedDirectoryLink>
                          <FavoriteButton slug={p.slug} />
                          <span className="text-[10px] rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400 font-medium">
                            {readiness}% ready • Trust {getTrustScore(p)}/100
                            {(p as any).verification_details?.domain_verified || (p as any).custom_domain_verified ? ' ✓' : ''}
                            {Array.isArray((p as any).verification_details?.docs_provided) && (p as any).verification_details.docs_provided.length > 0 ? ' 📜' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-[#9CA3AF] mt-1">/{p.slug}</div>
                      </div>
                    );
                  })}
              </div>
              <a 
                href={`/directory?category=${categoryFilter}&type=${type}&min_readiness=80`}
                className="mt-3 inline-block text-sm text-cyan-600 hover:text-cyan-800"
              >
                View all high readiness pages in this category →
              </a>
            </div>
          )}

          {!results.length ? (
            <div className="card p-8 text-center">
              <p className="text-[#9CA3AF]">No published offers match this search.</p>
              <a href="/create" className="btn-primary mt-5 inline-flex items-center gap-2">
                Create page
                <ArrowRight className="size-4" />
              </a>
            </div>
          ) : null}

          {/* Phase 7 Tier 2 Marketplace basics (favorites localStorage + server sync via FavoriteButton, trending stub) */}
          <div className="mt-8 text-xs text-[#9CA3AF]">
            Marketplace mode: Click "★ Favorite" on cards (saved in browser + synced to account when signed in). Trending based on recent agent activity (stub). Full /marketplace route available.
            <a href="/marketplace" className="ml-2 underline">Go to full Marketplace →</a>
          </div>
        </div>
      </section>
    </main>
  )
}

function DirectoryCard({ result }: { result: AgentSearchResult }) {
  const offer = result.offer
  const page = result.page as any

  const readiness = getReadinessScore({
    name: page.name,
    slug: page.slug,
    description: page.description,
    website_url: page.website_url,
    cta_url: page.cta_url,
    audience: page.audience,
    location: page.location,
    contact_email: page.contact_email,
    industry: page.industry,
    products: page.products,
    services: page.services,
    faqs: page.faqs,
    is_published: true,
  })

  return (
    <article className="card !p-5 transition hover:border-[#7C3AED]/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#00F5FF]">
            {offer?.type ?? 'page'} match
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">{offer?.name || result.page.name}</h3>
          <a href={result.page.url} className="mt-1 inline-block font-mono text-sm text-[#9CA3AF] hover:text-white">
            /{result.page.slug}
          </a>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-[#9CA3AF]">
            {result.score}
          </div>
          <div className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${readiness >= 75 ? 'bg-emerald-500/10 text-emerald-400' : readiness >= 55 ? 'bg-amber-500/10 text-amber-400' : 'bg-white/10 text-[#9CA3AF]'}`}>
            {readiness}% ready
          </div>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#9CA3AF]">
        {offer?.description || result.page.description || 'No summary provided.'}
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#9CA3AF]">
        {offer?.price ? <span className="rounded-md bg-cyan-500/10 px-2 py-1 text-cyan-400">{offer.price}</span> : null}
        {result.page.location ? <span className="rounded-md bg-white/10 px-2 py-1">{result.page.location}</span> : null}
        {result.page.audience ? <span className="rounded-md bg-white/10 px-2 py-1">{result.page.audience}</span> : null}
        {/* Phase 5 signals */}
        {((result.page as any).services?.length || 0) + ((result.page as any).products?.length || 0) > 0 && (
          <span className="rounded-md bg-white/10 px-2 py-1">{((result.page as any).services?.length || 0) + ((result.page as any).products?.length || 0)} offers</span>
        )}
        {(result.page as any).last_booking && <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-400">recent activity</span>}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <TrackedDirectoryLink
          href={result.page.url}
          slug={result.page.slug}
          action="public_page"
          offerKey={offer?.key}
          offerName={offer?.name || result.page.name}
          offerKind={offer?.type === 'product' ? 'products' : 'services'}
          className="btn-secondary inline-flex items-center gap-2 text-sm"
        >
          Public page
          <ExternalLink className="size-4" />
        </TrackedDirectoryLink>
        <TrackedDirectoryLink
          href={result.page.agent_json_url}
          slug={result.page.slug}
          action="agent_json"
          offerKey={offer?.key}
          offerName={offer?.name || result.page.name}
          offerKind={offer?.type === 'product' ? 'products' : 'services'}
          className="btn-secondary inline-flex items-center gap-2 text-sm"
        >
          Agent JSON
          <Code2 className="size-4" />
        </TrackedDirectoryLink>
        {offer ? (
          <TrackedDirectoryLink
            href={offer.checkout_url}
            slug={result.page.slug}
            action="checkout"
            offerKey={offer.key}
            offerName={offer.name}
            offerKind={offer.type === 'product' ? 'products' : 'services'}
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            Checkout
            <ArrowRight className="size-4" />
          </TrackedDirectoryLink>
        ) : null}
      </div>
    </article>
  )
}

function FilterLink({
  label,
  value,
  active,
  query,
  param = 'type',
  currentOther,
}: {
  label: string
  value: string
  active: boolean
  query: string
  param?: string
  currentOther?: string
}) {
  const otherParam = param === 'type' ? 'category' : 'type'
  const otherValue = currentOther || 'all'

  return (
    <a
      href={`/directory?q=${encodeURIComponent(query)}&${param}=${value}&${otherParam}=${otherValue}`}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        active ? 'bg-[#7C3AED] text-white' : 'border border-white/10 bg-[#1A1625] text-[#9CA3AF] hover:border-[#7C3AED]/30'
      }`}
    >
      {label}
    </a>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#1A1625] border border-white/10 p-3">
      <p className="text-xs text-[#9CA3AF]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}
