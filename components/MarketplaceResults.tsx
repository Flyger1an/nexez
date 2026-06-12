'use client'

import { useState, useEffect } from 'react'
import { FavoriteButton } from './FavoriteButton'
import { TrackedDirectoryLink } from './TrackedDirectoryLink'
import { agentRuntimeUrl, appUrl } from '../lib/site'

export function MarketplaceResults({ initialResults }: { initialResults: any[] }) {
  const [showOnlyFavs, setShowOnlyFavs] = useState(false)
  const [favs, setFavs] = useState<string[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = JSON.parse(localStorage.getItem('nexez_favorites') || '[]')
      setFavs(stored)
    }
  }, [])

  const filtered = showOnlyFavs ? initialResults.filter((item: any) => favs.includes(item.slug)) : initialResults

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => setShowOnlyFavs(!showOnlyFavs)}
          className={`text-sm px-3 py-1 rounded border ${showOnlyFavs ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'border-white/10 hover:bg-white/5'}`}
        >
          {showOnlyFavs ? 'Show All' : '★ My Favorites Only'}
        </button>
        <span className="text-xs text-[#9CA3AF]">{filtered.length} shown</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length > 0 ? filtered.slice(0, 12).map((item: any) => (
          <div key={item.slug} className="card !p-5 hover:border-[#7C3AED]/30 transition">
            <div className="flex justify-between">
              <a href={agentRuntimeUrl(`/${item.slug}`)} className="font-semibold text-lg text-white hover:text-[#7C3AED]">{item.name}</a>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Trust {item.trust_score || 70}</span>
            </div>
            <p className="mt-1 text-sm text-[#9CA3AF] line-clamp-2">{item.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {item.industry && <span className="bg-white/10 px-2 py-0.5 rounded text-[#9CA3AF]">{item.industry}</span>}
              <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded">Readiness {item.readiness}</span>
              {item.offer_count > 0 && <span className="text-[#9CA3AF]">{item.offer_count} offers</span>}
              {item.verified && <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">✓ Verified</span>}
              {item.has_credentials && <span className="bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded">📜 Creds</span>}
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <TrackedDirectoryLink href={item.agent_json_url} slug={item.slug} action="agent_json" surface="marketplace" className="text-[#7C3AED] hover:underline">Agent JSON</TrackedDirectoryLink>
              <TrackedDirectoryLink href={agentRuntimeUrl(`/${item.slug}`)} slug={item.slug} action="public_page" surface="marketplace" className="text-[#9CA3AF] hover:underline">View</TrackedDirectoryLink>
              <TrackedDirectoryLink href={appUrl(`/dashboard/competitors?slug=${item.slug}`)} slug={item.slug} action="analyze" surface="marketplace" className="text-[#7C3AED] hover:underline">Analyze</TrackedDirectoryLink>
              <FavoriteButton slug={item.slug} />
            </div>
          </div>
        )) : (
          <div className="col-span-full text-center text-[#9CA3AF] py-8">No favorites yet or no matches. Star some pages above!</div>
        )}
      </div>
    </>
  )
}
