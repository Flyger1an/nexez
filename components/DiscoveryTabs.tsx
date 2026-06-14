'use client'

import { usePathname } from 'next/navigation'
import { Search, Trophy } from 'lucide-react'

// Section nav for Discovery. Browse (search + trending) and Leaderboard (ranked)
// are two lenses on the same published-pages corpus, sharing one tabbed header.
const TABS = [
  { href: '/discovery', label: 'Browse', hint: 'Search & trending', icon: Search },
  { href: '/leaderboard', label: 'Leaderboard', hint: 'Top-ranked', icon: Trophy },
] as const

export function DiscoveryTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Discovery" className="mb-6">
      <p className="eyebrow mb-2">Discovery</p>
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-white/[0.03] p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          const Icon = tab.icon
          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-[var(--signal)]/15 text-[var(--signal)]'
                  : 'text-[#9CA3AF] hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
              <span className="hidden text-[10px] text-zinc-500 sm:inline">· {tab.hint}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
