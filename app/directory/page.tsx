import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Bot, Code2, ExternalLink, Search, Sparkles } from 'lucide-react'
import { AgentPage, getBaseUrl, getOfferCount } from '../../lib/agent-page'
import { AgentSearchResult, searchAgentPages } from '../../lib/agent-search'
import { supabase } from '../../lib/supabase'

type DirectoryProps = {
  searchParams: Promise<{ q?: string; type?: string }>
}

const quickFilters = ['consulting', 'strategy session', 'bookings', 'products', 'retainers']

export const metadata: Metadata = {
  title: 'Agent Directory | Nexez',
  description: 'Search published AI-readable products and services on Nexez.',
}

export default async function DirectoryPage({ searchParams }: DirectoryProps) {
  const { q = '', type = 'all' } = await searchParams
  const cleanQuery = q.trim()
  const baseUrl = getBaseUrl()
  const { data: pages } = await supabase
    .from('pages')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  const allResults = searchAgentPages(pages ?? [], cleanQuery, 50)
  const results = allResults.filter((result) => {
    if (type === 'all') return true
    return result.offer?.type === type
  })
  const pageCount = pages?.length ?? 0
  const offerCount = pages?.reduce((sum, page) => sum + getOfferCount(page), 0) ?? 0

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
              <ArrowLeft className="size-4" />
              Nexez
            </a>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a href="/agent-pages.json" className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-zinc-700 hover:bg-zinc-50">
                <Code2 className="size-4" />
                Agent Index
              </a>
              <a href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 font-medium text-white hover:bg-zinc-800">
                Dashboard
              </a>
            </div>
          </div>

          <div className="grid gap-8 py-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-800">
                <Bot className="size-4" />
                Public Agent Directory
              </div>
              <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
                Discover AI-ready services and products.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600">
                Search published Nexez agent pages by buyer intent, then open the public page, agent manifest, or checkout handoff.
              </p>
            </div>

            <form action="/directory" className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 shadow-sm">
              <label className="relative block">
                <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
                <input
                  name="q"
                  defaultValue={cleanQuery}
                  className="h-14 w-full rounded-lg border border-zinc-200 bg-white pl-12 pr-4 text-base outline-none placeholder:text-zinc-400 focus:border-cyan-500"
                  placeholder="Search for strategy sessions, bookings, retainers..."
                />
              </label>
              <input type="hidden" name="type" value={type} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
                  Search
                </button>
                {quickFilters.map((filter) => (
                  <a
                    key={filter}
                    href={`/directory?q=${encodeURIComponent(filter)}&type=${type}`}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 hover:border-cyan-300 hover:text-cyan-700"
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
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm font-semibold text-zinc-500">Directory stats</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Pages" value={String(pageCount)} />
              <Stat label="Offers" value={String(offerCount)} />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm font-semibold text-zinc-500">Offer type</p>
            <div className="mt-4 grid gap-2">
              <FilterLink label="All" value="all" active={type === 'all'} query={cleanQuery} />
              <FilterLink label="Services" value="service" active={type === 'service'} query={cleanQuery} />
              <FilterLink label="Products" value="product" active={type === 'product'} query={cleanQuery} />
            </div>
          </div>

          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-5">
            <div className="flex items-center gap-2 text-cyan-900">
              <Sparkles className="size-4" />
              <p className="text-sm font-semibold">Agent API</p>
            </div>
            <code className="mt-4 block break-all rounded-lg bg-white p-3 text-xs leading-5 text-zinc-700">
              {`${baseUrl}/api/agent-search?q=${encodeURIComponent(cleanQuery || 'consulting')}`}
            </code>
          </div>
        </aside>

        <div>
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="text-sm text-zinc-500">{results.length} matching offers</p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {cleanQuery ? `Results for "${cleanQuery}"` : 'All agent-ready offers'}
              </h2>
            </div>
            <a href="/openapi.json" className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700 hover:text-cyan-900">
              OpenAPI
              <ExternalLink className="size-4" />
            </a>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {results.map((result) => (
              <DirectoryCard key={`${result.page.slug}-${result.offer?.key ?? 'page'}`} result={result} />
            ))}
          </div>

          {!results.length ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center">
              <p className="text-zinc-500">No published offers match this search.</p>
              <a href="/create" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
                Create page
                <ArrowRight className="size-4" />
              </a>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function DirectoryCard({ result }: { result: AgentSearchResult }) {
  const offer = result.offer

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-cyan-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">
            {offer?.type ?? 'page'} match
          </p>
          <h3 className="mt-2 text-xl font-semibold">{offer?.name || result.page.name}</h3>
          <a href={result.page.url} className="mt-1 inline-block font-mono text-sm text-zinc-500 hover:text-cyan-700">
            /{result.page.slug}
          </a>
        </div>
        <div className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
          {result.score}
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-600">
        {offer?.description || result.page.description || 'No summary provided.'}
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-600">
        {offer?.price ? <span className="rounded-md bg-cyan-50 px-2 py-1 text-cyan-800">{offer.price}</span> : null}
        {result.page.location ? <span className="rounded-md bg-zinc-100 px-2 py-1">{result.page.location}</span> : null}
        {result.page.audience ? <span className="rounded-md bg-zinc-100 px-2 py-1">{result.page.audience}</span> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href={result.page.url} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Public page
          <ExternalLink className="size-4" />
        </a>
        <a href={result.page.agent_json_url} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Agent JSON
          <Code2 className="size-4" />
        </a>
        {offer ? (
          <a href={offer.checkout_url} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600">
            Checkout
            <ArrowRight className="size-4" />
          </a>
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
}: {
  label: string
  value: string
  active: boolean
  query: string
}) {
  return (
    <a
      href={`/directory?q=${encodeURIComponent(query)}&type=${value}`}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        active ? 'bg-zinc-950 text-white' : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
      }`}
    >
      {label}
    </a>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}
