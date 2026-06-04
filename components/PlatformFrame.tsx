'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'

// The heavy chrome (nav + search + supabase + icons) is code-split into
// PlatformShell and only loaded on platform routes. Public/agent pages, the
// landing page, auth, and legal pages render children directly — they never
// pull the shell bundle, keeping those surfaces lean (esp. the agent pages).
const PlatformShell = dynamic(() => import('./PlatformShell'))

const platformPrefixes = [
  '/dashboard',
  '/create',
  '/simulator',
  '/marketplace',
  '/directory',
  '/leaderboard',
  '/support',
]

export function PlatformFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const shouldFrame = platformPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (!shouldFrame) return <>{children}</>
  return <PlatformShell>{children}</PlatformShell>
}
