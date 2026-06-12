'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { isMarketingPath } from '../lib/site'

// The heavy chrome is code-split and only loaded where it's used:
//  - PlatformShell: the in-app product nav (nexez.app: dashboard, page builder).
//  - MarketingShell: the marketing nav/footer (nexez.ai: discovery, simulator, …).
// Agent/public pages, the homepage (its own bespoke nav), auth, and legal render
// children directly — keeping those surfaces (esp. the agent pages) lean.
const PlatformShell = dynamic(() => import('./PlatformShell'))
const MarketingShell = dynamic(() => import('./MarketingShell').then((m) => m.MarketingShell))

// Product routes that get the in-app shell. The discovery/simulator/support
// surfaces moved to MarketingShell as part of the nexez.ai / nexez.app split.
const platformPrefixes = ['/dashboard', '/create']

export function PlatformFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  // Marketing surfaces (nexez.ai) — but NOT the homepage, which ships its own nav.
  if (pathname !== '/' && isMarketingPath(pathname)) {
    return <MarketingShell>{children}</MarketingShell>
  }

  const shouldFrame = platformPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  if (shouldFrame) return <PlatformShell>{children}</PlatformShell>

  return <>{children}</>
}
