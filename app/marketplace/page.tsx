import type { Metadata } from 'next'
import { Star, TrendingUp } from 'lucide-react'
import { getBaseUrl } from '../../lib/agent-page'
import { MarketplaceResults } from '../../components/MarketplaceResults'
import { TrackedDirectoryLink } from '../../components/TrackedDirectoryLink'

export const metadata: Metadata = {
  title: 'Nexez Agent Marketplace',
  description: 'Browse, favorite, and discover agent-optimized offers from across Nexez. Trending and high-trust pages for agents and humans.',
}

async function fetchMarketplaceData() {
  try {
    const base = getBaseUrl()
    const res = await fetch(`${base}/api/directory?min_readiness=50`, { cache: 'no-store' })
    if (!res.ok) return { results: [], count: 0 }
    const data = await res.json()
    return { results: data.results || [], count: data.count || 0 }
  } catch {
    return { results: [], count: 0 }
  }
}

export default async function MarketplacePage() {
  const { results, count } = await fetchMarketplaceData()

  // Simple trending: high trust + recent activity first (data flywheel from events/last_booking)
  const trending = [...results]
    .sort((a: any, b: any) => {
      const aScore = (a.trust_score || 0) + (a.has_recent_activity ? 10 : 0)
      const bScore = (b.trust_score || 0) + (b.has_recent_activity ? 10 : 0)
      return bScore - aScore
    })
    .slice(0, 6)

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight flex items-center gap-2">
              <Star className="size-8 text-[#7C3AED]" /> Agent Marketplace
            </h1>
            <p className="mt-2 text-base md:text-lg text-[#9CA3AF]">High-trust, agent-ready offers. ({count} listings)</p>
          </div>
          <a href="/directory" className="btn-secondary inline-flex items-center gap-2 self-start md:self-auto">
            Full Directory + Filters <TrendingUp className="size-4" />
          </a>
        </div>

        <MarketplaceResults initialResults={results} />

        {/* Trending section (enhanced MVP) */}
        {trending.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="size-5 text-[#7C3AED]" />
              <h3 className="font-semibold">Trending (high trust + activity)</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              {trending.map((item: any) => (
                <TrackedDirectoryLink
                  key={item.slug}
                  href={`/${item.slug}`}
                  slug={item.slug}
                  action="public_page"
                  surface="marketplace"
                  className="block card !p-3 text-sm hover:border-[#7C3AED]/30"
                >
                  {item.name} <span className="text-xs text-emerald-400">Trust {item.trust_score}</span>
                  {item.verified && ' ✓'}
                </TrackedDirectoryLink>
              ))}
            </div>
          </div>
        )}

        {/* Favorites now fully client-filterable via the toggle in MarketplaceResults (★ My Favorites Only). Persists local + server metadata sync on auth. */}

        <div className="card p-6 text-sm">
          <h3 className="font-semibold">Marketplace Tips for Agents</h3>
          <ul className="mt-2 list-disc pl-5 text-[#9CA3AF] space-y-1">
            <li>Use min_readiness=80 for elite.</li>
            <li>Favorites save locally.</li>
            <li>Trust + activity rank.</li>
            <li>Check /&lt;slug&gt;/agent.json , /llms.txt or mcp.json for structured data</li>
            <li>Use Analyzer + Co-Pilot.</li>
          </ul>
          <p className="mt-3 text-xs text-[#9CA3AF]">Analyzer supports any URL.</p>
        </div>

        <div className="mt-6 text-center">
          <a href="/create" className="btn-secondary inline-flex items-center gap-2">
            List your offers in the Marketplace
          </a>
        </div>
      </div>
    </main>
  )
}
