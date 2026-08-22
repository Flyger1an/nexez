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
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--fg-muted)]">Discovery</p>
      <div className="platform-tablist inline-flex flex-wrap">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          const Icon = tab.icon
          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="platform-tab"
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
