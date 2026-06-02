import type { Metadata } from 'next'
import { ArrowLeft, Star, TrendingUp } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Nexez Agent Marketplace',
  description: 'Browse, favorite, and discover agent-optimized offers from across Nexez. Trending and high-trust pages for agents and humans.',
}

async function fetchMarketplaceData() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/directory?min_readiness=50`, { cache: 'no-store' })
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
    <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft className="size-4" />
          Nexez
        </a>

        <div className="mt-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight flex items-center gap-2">
              <Star className="size-8 text-[#7C3AED]" /> Agent Marketplace
            </h1>
            <p className="mt-2 text-lg text-zinc-600">Discover high-trust, agent-ready offers. Favorite for your prompts. Trending based on real agent activity. ({count} high-quality listings)</p>
          </div>
          <a href="/directory" className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
            Full Directory + Filters <TrendingUp className="size-4" />
          </a>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.length > 0 ? results.slice(0, 12).map((item: any) => (
            <div key={item.slug} className="rounded-lg border border-zinc-200 bg-white p-5 hover:border-[#7C3AED]/50 transition">
              <div className="flex justify-between">
                <a href={`/${item.slug}`} className="font-semibold text-lg text-zinc-900 hover:text-[#7C3AED]">{item.name}</a>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Trust {item.trust_score || 70}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 line-clamp-2">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {item.industry && <span className="bg-zinc-100 px-2 py-0.5 rounded">{item.industry}</span>}
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Readiness {item.readiness}</span>
                {item.offer_count > 0 && <span>{item.offer_count} offers</span>}
                {item.verified && <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">✓ Verified</span>}
                {item.has_credentials && <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">📜 Creds</span>}
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <a href={item.agent_json_url} className="text-[#7C3AED] hover:underline">Agent JSON</a>
                <a href={`/${item.slug}`} className="text-zinc-500 hover:underline">View</a>
                <a href={`/dashboard/competitors?slug=${item.slug}`} className="text-[#7C3AED] hover:underline">Analyze</a>
                <button onClick={async () => {
                  if (typeof window !== 'undefined') {
                    const key = 'nexez_favorites'
                    let cur = JSON.parse(localStorage.getItem(key) || '[]')
                    const isFav = cur.includes(item.slug)
                    let next
                    if (isFav) {
                      next = cur.filter((s: string) => s !== item.slug)
                      localStorage.setItem(key, JSON.stringify(next))
                      alert('Unfavorited')
                    } else {
                      next = [...cur, item.slug]
                      localStorage.setItem(key, JSON.stringify(next))
                      try {
                        const { createClient } = await import('../../utils/supabase/client')
                        const supa = createClient()
                        const { data: { user } } = await supa.auth.getUser()
                        if (user) {
                          await supa.auth.updateUser({ data: { favorites: next } })
                        }
                      } catch {}
                      alert('Favorited! (local + account sync if signed in)')
                    }
                  }
                }} className="text-amber-500 hover:text-amber-600">★ Toggle Favorite</button>
              </div>
            </div>
          )) : (
            <div className="col-span-full text-center text-zinc-500 py-8">No listings yet. Create pages to populate the marketplace.</div>
          )}
        </div>

        {/* Trending section (enhanced MVP) */}
        {trending.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="size-5 text-[#7C3AED]" />
              <h3 className="font-semibold">Trending (high trust + activity)</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              {trending.map((item: any) => (
                <a key={item.slug} href={`/${item.slug}`} className="block rounded border border-zinc-200 bg-white p-3 hover:border-[#7C3AED]/50">
                  {item.name} <span className="text-xs text-emerald-600">Trust {item.trust_score}</span>
                  {item.verified && ' ✓'}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 text-sm">
          <h3 className="font-semibold">Marketplace Tips for Agents</h3>
          <ul className="mt-2 list-disc pl-5 text-zinc-600 space-y-1">
            <li>Use min_readiness=80 in /api/directory for elite listings; high Trust + Verified = stronger signals</li>
            <li>Favorites saved locally (★) — copy slugs to your prompts. Sign in for future cloud sync.</li>
            <li>High trust + recent activity = reliable for booking (trending sorted by trust+events)</li>
            <li>Check /&lt;slug&gt;/agent.json , /llms.txt or mcp.json for structured data</li>
            <li>From dashboard: use Competitor Website Analyzer + AI Co-Pilot to beat the competition</li>
          </ul>
          <p className="mt-3 text-xs text-zinc-500">Use /dashboard/competitors to run deep analysis (any URL) or benchmark Nexez pages. Data from analyses + trust events improves recommendations over time.</p>
        </div>

        <div className="mt-6 text-center">
          <a href="/create" className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            List your offers in the Marketplace
          </a>
        </div>
      </div>
    </main>
  )
}
