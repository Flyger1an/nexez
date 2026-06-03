'use client'

import type { ReactNode } from 'react'

type TrackedDirectoryLinkProps = {
  href: string
  slug: string
  action: 'public_page' | 'agent_json' | 'checkout' | 'analyze' | 'favorite' | 'similar_page'
  surface?: 'directory' | 'marketplace'
  offerKey?: string
  offerName?: string
  offerKind?: 'services' | 'products'
  query?: string
  className?: string
  children: ReactNode
}

export function TrackedDirectoryLink({
  href,
  slug,
  action,
  surface = 'directory',
  offerKey,
  offerName,
  offerKind,
  query,
  className,
  children,
}: TrackedDirectoryLinkProps) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        trackDirectoryClick({
          href,
          slug,
          action,
          surface,
          offerKey,
          offerName,
          offerKind,
          query,
        })
      }}
    >
      {children}
    </a>
  )
}

function trackDirectoryClick(payload: Omit<TrackedDirectoryLinkProps, 'className' | 'children'>) {
  const body = JSON.stringify(payload)

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon('/api/directory/click', blob)) return
    }
  } catch {}

  fetch('/api/directory/click', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}
