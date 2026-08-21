import type { Metadata } from 'next'
import { ArrowRight, Bot, Code2, ExternalLink, Search, Sparkles, Star, Store } from 'lucide-react'
import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getOfferCount, getReadinessScore, getTrustScore } from '../../lib/agent-page'
import { AgentSearchResult, searchAgentPages } from '../../lib/agent-search'
import { classifyMarketplaceCategory } from '../../lib/marketplace'
import { cleanLocationQuery, filterPagesByLocation } from '../../lib/location-filter'
import { publicLaunchVisiblePages } from '../../lib/public-page-visibility'
import { supabase } from '../../lib/supabase'
import { loadReviewSummariesForSlugs } from '../../lib/server/reviews'
import { loadPublicStorefronts, loadStorefrontHandlesForSlugs } from '../../lib/server/storefront'
import { CopyButton } from './CopyButton'
import { LocationFilter } from './LocationFilter'
import { RankingReasons } from './RankingReasons'
import { FavoriteButton } from '../../components/FavoriteButton'
import { TrackedDirectoryLink } from '../../components/TrackedDirectoryLink'
import { DiscoveryTabs } from '../../components/DiscoveryTabs'
import { agentRuntimeUrl, appUrl, marketingUrl } from '../../lib/site'

type DirectoryProps = {
  searchParams: Promise<{ q?: string; type?: string; category?: string; min_readiness?: string; sort?: string; location?: string }>
}

const quickFilters = ['consulting', 'strategy session', 'bookings', 'products', 'retainers']

// Trending = high-trust + recent activity (the old Marketplace's ranking),
// now a sort mode of the unified Browse view.
function trendingScore(result: AgentSearchResult): number {
  const p = result.page as unknown as Record<string, unknown>
  const trust = getTrustScore({
    ...(p as Partial<AgentPage>),
    products: (p.products as AgentPage['products']) ?? [],
    services: (p.services as AgentPage['services']) ?? [],
    faqs: (p.faqs as AgentPage['faqs']) ?? [],
    is_published: true,
  })
  return trust + (p.last_booking ? 12 : 0)
}

export const metadata: Metadata = {
  title: 'Discovery - Browse agent-ready offers',
  description:
    'Browse the live directory of agent-ready businesses — search by category, compare readiness scores, and transact with listings built for AI agents.',
  alternates: {
    // Unparameterized on purpose: the page links ?q=/?category=/?sort= permutations
    // of itself, and this canonical dedupes them all to the bare listing URL.
    canonical: marketingUrl('/discovery'),
  },
  // Page-level openGraph replaces the layout's wholesale (shallow merge) — re-carry type/siteName.
  openGraph: {
    type: 'website',
    siteName: 'Nexez',
    url: marketingUrl('/discovery'),
    title: 'Discovery - Browse agent-ready offers',
    description:
      'Browse the live directory of agent-ready businesses — search by category, compare readiness scores, and transact with listings built for AI agents.',
  },
}

export default async function DirectoryPage({ searchParams }: DirectoryProps) {
  const { q = '', type = 'all', category: rawCategory = 'all', min_readiness: rawMin = '0', sort: rawSort = '', location: rawLocation = '' } = await searchParams
  const sortMode: 'relevant' | 'trending' | 'new' = rawSort === 'trending' || rawSort === 'new' ? rawSort : 'relevant'
  const cleanQuery = q.trim()
  const cleanLocation = cleanLocationQuery(rawLocation)
  const categoryFilter = (rawCategory === 'professional' || rawCategory === 'consumer') ? rawCategory : 'all'
  const minReadiness = Math.max(0, parseInt(rawMin, 10) || 0)
  const baseUrl = getBaseUrl()
  const { data: pages } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  const visiblePages = publicLaunchVisiblePages(pages)
  const visibleSlugs = visiblePages.map((page) => page.slug)
  const [storefronts, storefrontHandles, reviewSummaries] = await Promise.all([
    loadPublicStorefronts(8),
    loadStorefrontHandlesForSlugs(visibleSlugs),
    loadReviewSummariesForSlugs(visibleSlugs, 0),
  ])
  let filteredPages = visiblePages
  if (categoryFilter !== 'all') {
    filteredPages = filteredPages.filter(p => {
      const isConsumer = classifyMarketplaceCategory(p) === 'consumer'
      return categoryFilter === 'consumer' ? isConsumer : !isConsumer
    })
  }
  filteredPages = filterPagesByLocation(filteredPages, cleanLocation)

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

  const allResults = searchAgentPages(filteredPages, cleanQuery, 50, baseUrl, {
    location: cleanLocation,
    storefrontHandles,
    reviewSummaries,
  })

  const results = allResults.filter((result) => {
    if (type === 'all') return true
    return result.offer?.type === type
  })
  if (sortMode === 'trending') {
    results.sort((a, b) => trendingScore(b) - trendingScore(a))
  } else if (sortMode === 'new') {
    results.sort(
      (a, b) =>
        new Date((b.page as unknown as { created_at?: string }).created_at ?? 0).getTime() -
        new Date((a.page as unknown as { created_at?: string }).created_at ?? 0).getTime(),
    )
  }
  const pageCount = visiblePages.length
  const offerCount = visiblePages.reduce((sum, page) => sum + getOfferCount(page), 0)

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <section className="border-b border-white/10 bg-[#0F0D18]">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <DiscoveryTabs />
          <div className="flex justify-end">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a href={agentRuntimeUrl('/agent-pages.json')} className="btn-secondary inline-flex items-center gap-2">
                <Code2 className="size-4" />
                Agent Index
              </a>
            </div>
          </div>

          <div className="grid gap-8 py-8 md:py-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-3 py-1 text-sm font-medium text-[var(--signal)]">
                <Bot className="size-4" />
                Public Agent Directory
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                Discover AI-ready services and products.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#9CA3AF]">
                Search published Nexez listings by buyer intent, then open the public listing, agent manifest, or checkout handoff.
              </p>
              <a
                href="/leaderboard"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-3 py-1.5 text-sm text-[var(--amber)] hover:bg-[var(--amber)]/20"
              >
                🏆 Agent-Ready Leaderboard
              </a>
            </div>

            <form action="/discovery" className="rounded-lg border border-white/10 bg-[#1A1625] p-3">
              <label className="relative block">
                <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  name="q"
                  defaultValue={cleanQuery}
                  className="input h-14 w-full !pl-12 pr-4 text-base"
                  placeholder="Search for strategy sessions, bookings, retainers..."
                />
              </label>
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="category" value={categoryFilter} />
              {minReadiness > 0 && <input type="hidden" name="min_readiness" value={String(minReadiness)} />}
              <LocationFilter defaultValue={cleanLocation} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary px-5 py-2.5 text-sm">
                  Search
                </button>
                {quickFilters.map((filter) => (
                  <a
                    key={filter}
                    href={discoveryHref({ q: filter, type, category: categoryFilter, minReadiness, location: cleanLocation })}
                    className="rounded-lg border border-white/10 bg-[#1A1625] px-3 py-2 text-sm text-[#9CA3AF] hover:border-[var(--signal)]/30 hover:text-white"
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
              <Stat label="Listings" value={String(pageCount)} />
              <Stat label="Offers" value={String(offerCount)} />
            </div>
          </div>

          {storefronts.length > 0 ? (
            <div className="card !p-5">
              <p className="text-sm font-semibold text-[#9CA3AF]">Storefronts</p>
              <div className="mt-3 grid gap-1">
                {storefronts.map((s) => (
                  <a
                    key={s.handle}
                    href={agentRuntimeUrl(`/store/${s.handle}`)}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
                  >
                    <span className="min-w-0 truncate">{s.display_name || s.handle}</span>
                    <span className="ml-2 shrink-0 text-xs text-[#9CA3AF]">{s.listing_count}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <div className="card !p-5">
            <p className="text-sm font-semibold text-[#9CA3AF]">Offer type</p>
            <div className="mt-4 grid gap-2">
              <FilterLink label="All" value="all" active={type === 'all'} query={cleanQuery} currentOther={categoryFilter} location={cleanLocation} />
              <FilterLink label="Services" value="service" active={type === 'service'} query={cleanQuery} currentOther={categoryFilter} location={cleanLocation} />
              <FilterLink label="Products" value="product" active={type === 'product'} query={cleanQuery} currentOther={categoryFilter} location={cleanLocation} />
            </div>
          </div>

          <div className="card !p-5">
            <p className="text-sm font-semibold text-[#9CA3AF]">Category</p>
            <div className="mt-4 grid gap-2">
              <FilterLink label="All" value="all" active={categoryFilter === 'all'} query={cleanQuery} param="category" currentOther={type} location={cleanLocation} />
              <FilterLink label="Professional" value="professional" active={categoryFilter === 'professional'} query={cleanQuery} param="category" currentOther={type} location={cleanLocation} />
              <FilterLink label="Consumer / Local" value="consumer" active={categoryFilter === 'consumer'} query={cleanQuery} param="category" currentOther={type} location={cleanLocation} />
            </div>
          </div>

          <div className="card !p-5">
            <div className="flex items-center gap-2 text-[var(--signal)]">
              <Sparkles className="size-4" />
              <p className="text-sm font-semibold">Agent API</p>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between text-[#9CA3AF] mb-1">
                  <span>Agent search</span>
                  <CopyButton text={`${baseUrl}/api/agent-search?q=${encodeURIComponent(cleanQuery || 'consulting')}${cleanLocation ? `&location=${encodeURIComponent(cleanLocation)}` : ''}`} />
                </div>
                <code className="block break-all rounded bg-[#0A0A0F] p-2 text-[var(--signal)] font-mono text-[10px]">
                  {`${baseUrl}/api/agent-search?q=${encodeURIComponent(cleanQuery || 'consulting')}${cleanLocation ? `&location=${encodeURIComponent(cleanLocation)}` : ''}`}
                </code>
              </div>
              <div>
                <div className="flex items-center justify-between text-[#9CA3AF] mb-1">
                  <span>Directory API</span>
                  <CopyButton text={`${baseUrl}/api/directory?category=consumer${cleanLocation ? `&location=${encodeURIComponent(cleanLocation)}` : ''}`} />
                </div>
                <code className="block break-all rounded bg-[#0A0A0F] p-2 text-[var(--signal)] font-mono text-[10px]">
                  {`${baseUrl}/api/directory?category=consumer${cleanLocation ? `&location=${encodeURIComponent(cleanLocation)}` : ''}`}
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
                {cleanLocation ? <p className="mt-1 text-sm text-[#9CA3AF]">Filtered near {cleanLocation}</p> : null}
              </div>
              <a href={agentRuntimeUrl('/openapi.json')} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--signal)] hover:text-[var(--signal)]">
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
                    href={discoveryHref({ q: cleanQuery, type, category: tab.value, minReadiness, location: cleanLocation })}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-[var(--signal-solid)] text-white'
                        : 'border border-white/10 bg-[#1A1625] text-[#9CA3AF] hover:border-[var(--signal)]/30'
                    }`}
                  >
                    {tab.label}
                  </a>
                )
              })}

              {/* Quick high-quality filter (Phase 2) */}
              <a
                href={discoveryHref({ q: cleanQuery, type, category: categoryFilter, minReadiness: 80, location: cleanLocation })}
                className="rounded-full border border-[var(--ready)]/50 bg-[var(--ready)]/10 px-4 py-1.5 text-sm font-medium text-[var(--ready)] hover:bg-[var(--ready)]/20"
              >
                High Quality (80%+)
              </a>
              <a
                href={discoveryHref({ q: cleanQuery, type, category: categoryFilter, minReadiness: 90, location: cleanLocation })}
                className="rounded-full border border-[var(--ready)]/50 bg-[var(--ready)]/10 px-4 py-1.5 text-sm font-medium text-[var(--ready)] hover:bg-[var(--ready)]/20"
              >
                Elite (90%+)
              </a>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#9CA3AF]">Sort</span>
            {[
              { label: 'Relevant', value: 'relevant' },
              { label: 'Trending', value: 'trending' },
              { label: 'Newest', value: 'new' },
            ].map((s) => {
              const active = sortMode === s.value
              const params = new URLSearchParams()
              if (cleanQuery) params.set('q', cleanQuery)
              if (type !== 'all') params.set('type', type)
              if (categoryFilter !== 'all') params.set('category', categoryFilter)
              if (minReadiness > 0) params.set('min_readiness', String(minReadiness))
              if (cleanLocation) params.set('location', cleanLocation)
              if (s.value !== 'relevant') params.set('sort', s.value)
              const qs = params.toString()
              return (
                <a
                  key={s.value}
                  href={`/discovery${qs ? `?${qs}` : ''}`}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active ? 'bg-[var(--signal)]/15 text-[var(--signal)]' : 'border border-white/10 text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {s.label}
                </a>
              )
            })}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {results.map((result) => (
              <DirectoryCard key={`${result.page.slug}-${result.offer?.key ?? 'page'}`} result={result} />
            ))}
          </div>

          {/* Phase 2: Agents also viewed / similar pages */}
          {results.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-semibold tracking-tight mb-4 text-white">Agents also viewed</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {visiblePages
                  .filter(p => p.is_published && ((p.services?.length ?? 0) + (p.products?.length ?? 0) > 0))
                  .filter(p => {
                    const inCurrentResults = results.some(r => r.page.slug === p.slug)
                    if (inCurrentResults) return false

                    // Same broad category
                    const isConsumer = classifyMarketplaceCategory(p) === 'consumer'
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
                            href={agentRuntimeUrl(`/${p.slug}`)}
                            slug={p.slug}
                            action="similar_page"
                            className="font-medium text-white hover:text-[var(--signal)]"
                          >
                            {p.name}
                          </TrackedDirectoryLink>
                          <FavoriteButton slug={p.slug} />
                          <div className="flex shrink-0 items-center gap-2">
                            {storefrontHandles.get(p.slug) ? (
                              <a
                                href={agentRuntimeUrl(`/store/${storefrontHandles.get(p.slug)}`)}
                                className="rounded bg-[var(--signal)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--signal)] hover:bg-[var(--signal)]/20"
                              >
                                Storefront
                              </a>
                            ) : null}
                            <span className="rounded bg-[var(--ready)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ready)]">
                              {readiness}% ready
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-[#9CA3AF] mt-1">/{p.slug}</div>
                      </div>
                    );
                  })}
              </div>
              <a 
                href={discoveryHref({ type, category: categoryFilter, minReadiness: 80, location: cleanLocation })}
                className="mt-3 inline-block text-sm text-[var(--signal)] hover:text-[var(--signal)]"
              >
                View all high readiness listings in this category →
              </a>
            </div>
          )}

          {!results.length ? (
            <div className="card p-8 text-center">
              <p className="text-[#9CA3AF]">No published offers match this search.</p>
              <a href={appUrl('/create')} className="btn-primary mt-5 inline-flex items-center gap-2">
                Create page
                <ArrowRight className="size-4" />
              </a>
            </div>
          ) : null}

          <div className="mt-8 text-xs text-[#9CA3AF]">
            Favorite listings, track popular agent-ready offers, and sort by what is trending right now.
            <a href="/discovery?sort=trending" className="ml-2 underline">See trending →</a>
          </div>
        </div>
      </section>
    </main>
  )
}

function DirectoryCard({ result }: { result: AgentSearchResult }) {
  const offer = result.offer
  const marketplace = result.marketplace
  const readiness = marketplace?.readiness ?? 0
  const storefront = result.page.storefront
  const rating = result.page.rating_summary

  return (
    <article className="card !p-5 transition hover:border-[var(--signal)]/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--signal)]">
            {offer?.type ?? 'listing'} match
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">{offer?.name || result.page.name}</h3>
          <a href={result.page.url} className="mt-1 inline-block font-mono text-sm text-[#9CA3AF] hover:text-white">
            /{result.page.slug}
          </a>
          {storefront ? (
            <a
              href={storefront.url}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--signal)]/20 bg-[var(--signal)]/10 px-2.5 py-1 text-xs font-medium text-[var(--signal)] transition hover:bg-[var(--signal)]/15"
            >
              <Store className="size-3.5" />
              {storefront.handle}
            </a>
          ) : null}
          {rating?.count ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--amber)]/20 bg-[var(--amber)]/10 px-2.5 py-1 text-xs font-medium text-[var(--amber)]">
              <Star className="size-3.5" fill="currentColor" />
              {rating.average}/5 · {rating.count} verified
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${readiness >= 75 ? 'bg-[var(--ready)]/10 text-[var(--ready)]' : readiness >= 55 ? 'bg-[var(--amber)]/10 text-[var(--amber)]' : 'bg-white/10 text-[#9CA3AF]'}`}>
            {readiness}% ready
          </div>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#9CA3AF]">
        {offer?.description || result.page.description || 'No summary provided.'}
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#9CA3AF]">
        {offer?.price ? <span className="rounded-md bg-[var(--signal)]/10 px-2 py-1 text-[var(--signal)]">{offer.price}</span> : null}
        {result.page.location ? <span className="rounded-md bg-white/10 px-2 py-1">{result.page.location}</span> : null}
        {result.page.audience ? <span className="rounded-md bg-white/10 px-2 py-1">{result.page.audience}</span> : null}
      </div>

      <RankingReasons reasons={result.match_reasons} />

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
          Public listing
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
        {storefront ? (
          <TrackedDirectoryLink
            href={storefront.url}
            slug={result.page.slug}
            action="storefront"
            offerKey={offer?.key}
            offerName={offer?.name || result.page.name}
            offerKind={offer?.type === 'product' ? 'products' : 'services'}
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            Storefront
            <Store className="size-4" />
          </TrackedDirectoryLink>
        ) : null}
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
  location,
}: {
  label: string
  value: string
  active: boolean
  query: string
  param?: string
  currentOther?: string
  location?: string
}) {
  const otherParam = param === 'type' ? 'category' : 'type'
  const otherValue = currentOther || 'all'

  return (
    <a
      href={discoveryHref({ q: query, [param]: value, [otherParam]: otherValue, location })}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        active ? 'bg-[var(--signal-solid)] text-white' : 'border border-white/10 bg-[#1A1625] text-[#9CA3AF] hover:border-[var(--signal)]/30'
      }`}
    >
      {label}
    </a>
  )
}

function discoveryHref(opts: { q?: string; type?: string; category?: string; minReadiness?: number; sort?: string; location?: string; [key: string]: string | number | undefined }) {
  const params = new URLSearchParams()
  if (opts.q) params.set('q', String(opts.q))
  if (opts.type && opts.type !== 'all') params.set('type', String(opts.type))
  if (opts.category && opts.category !== 'all') params.set('category', String(opts.category))
  if (opts.minReadiness && opts.minReadiness > 0) params.set('min_readiness', String(opts.minReadiness))
  if (opts.sort && opts.sort !== 'relevant') params.set('sort', String(opts.sort))
  if (opts.location) params.set('location', String(opts.location))
  const qs = params.toString()
  return `/discovery${qs ? `?${qs}` : ''}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#1A1625] border border-white/10 p-3">
      <p className="text-xs text-[#9CA3AF]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}
