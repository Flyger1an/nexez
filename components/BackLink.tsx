'use client'

import type { MouseEvent, ReactNode } from 'react'

// Back link that returns the visitor to the page that sent them here (the
// referrer / previous history entry) rather than a fixed destination. Falls
// back to `fallbackHref` for direct hits, bookmarks, and agents with no
// referrer. Uses history.back() so it lands on the actual directing page; the
// fallback href also makes it a real, crawlable link for non-JS / bots.
export function BackLink({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string
  className?: string
  children: ReactNode
}) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === 'undefined') return
    // Let modified / non-left clicks use the real href (open in new tab, etc.).
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const ref = document.referrer
    if (!ref || window.history.length <= 1) return
    try {
      // Don't "go back" onto an identical URL (e.g. a refresh sets referrer to self).
      if (ref !== window.location.href) {
        e.preventDefault()
        window.history.back()
      }
    } catch {
      /* fall through to fallbackHref */
    }
  }

  return (
    <a href={fallbackHref} onClick={onClick} className={className}>
      {children}
    </a>
  )
}
