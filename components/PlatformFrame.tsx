'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { isDualPath, isMarketingPath } from '../lib/site'

// The heavy chrome is code-split and only loaded where it's used:
//  - PlatformShell: the in-app product nav (app.nexez.ai: dashboard, page builder).
//  - MarketingShell: the marketing nav/footer (nexez.ai: homepage, discovery,
//    pricing, simulator, …).
// Agent/public pages, auth, and the API render children directly — keeping those
// surfaces (esp. the agent pages) lean.
const PlatformShell = dynamic(() => import('./PlatformShell'))
const MarketingShell = dynamic(() => import('./MarketingShell').then((m) => m.MarketingShell))

// Product routes that get the in-app shell. The discovery/simulator/support
// surfaces moved to MarketingShell as part of the nexez.ai / app.nexez.ai split.
const platformPrefixes = ['/dashboard', '/create']

// `hasSession` is resolved on the server (root layout reads the Supabase session
// cookie) so the shell choice is correct on first paint — no flash between the
// marketing and dashboard chrome on the dual discovery surfaces.
export function PlatformFrame({
  children,
  hasSession = false,
}: {
  children: ReactNode
  hasSession?: boolean
}) {
  const pathname = usePathname()

  // Dual discovery surfaces: signed-in visitors get the in-app dashboard nav
  // (and the proxy keeps them on the app host); anonymous visitors get the
  // marketing chrome. Checked before isMarketingPath, which also matches these.
  if (isDualPath(pathname)) {
    return hasSession ? (
      <PlatformShell>{children}</PlatformShell>
    ) : (
      <MarketingShell>{children}</MarketingShell>
    )
  }

  // Marketing surfaces (nexez.ai), including the homepage.
  if (isMarketingPath(pathname)) {
    return <MarketingShell>{children}</MarketingShell>
  }

  const shouldFrame = platformPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  if (shouldFrame) return <PlatformShell>{children}</PlatformShell>

  return <>{children}</>
}
