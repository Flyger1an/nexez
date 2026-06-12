'use client'

import { ReactNode, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { NexezLogo } from './NexezLogo'
import { ThemeToggle } from './ThemeToggle'
import { appUrl } from '../lib/site'

// Marketing chrome for the nexez.ai surfaces (discovery/simulator/support/legal).
// Modeled on the homepage nav so the marketing domain stays visually consistent.
// nexez.ai can't read the nexez.app session cookie (different registrable domain), so
// the nav renders the public "Sign in / Get started" CTAs by default and, as a
// best-effort progressive enhancement, pings nexez.app to swap them for "Dashboard"
// when the browser is signed in (works where third-party cookies are allowed).

// Best-effort cross-domain auth check: ask nexez.app whether this browser has a
// session (the SameSite=None `nx_authed` hint). Defaults to false (anon nav) and
// stays false where the browser blocks the credentialed ping (Safari ITP / Firefox).
function useAuthedHint(): boolean {
  const [authed, setAuthed] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(appUrl('/api/auth/ping'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { authed: false }))
      .then((d) => {
        if (!cancelled) setAuthed(Boolean(d?.authed))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return authed
}

const navLinks = [
  { label: 'Directory', href: '/directory' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Simulator', href: '/simulator' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Support', href: '/support' },
]

export function MarketingShell({ children }: { children: ReactNode }) {
  const authed = useAuthedHint()
  return (
    <div className="min-h-screen bg-background text-white">
      <nav className="nx-nav sticky top-0 z-50 border-b border-border backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md border border-border bg-white text-black">
              <NexezLogo className="size-6" />
            </div>
            <span className="text-sm font-medium tracking-tight">Nexez</span>
          </a>

          <div className="hidden items-center gap-0.5 lg:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className="hidden items-center gap-2 sm:flex">
              <ThemeToggle />
              {!authed && (
                <a href={appUrl('/login')} className="btn-secondary h-9 px-3">Sign in</a>
              )}
            </div>
            <a href={appUrl(authed ? '/dashboard' : '/onboard')} className="btn-primary h-9 px-3">
              {authed ? 'Dashboard' : 'Get started'}
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </nav>

      {children}

      <MarketingFooter />
    </div>
  )
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <div className="mb-3 text-xs uppercase tracking-widest text-zinc-500">{title}</div>
      <ul className="space-y-2">
        {links.map(([label, href]) => (
          <li key={href + label}>
            <a href={href} className="text-muted-foreground transition-colors hover:text-white">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MarketingFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <a href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md border border-border bg-white text-black">
              <NexezLogo className="size-5" />
            </div>
            <span className="font-medium">Nexez</span>
          </a>
          <p className="mt-3 max-w-xs text-muted-foreground">
            Pages built for AI agents to discover, understand, and buy from.
          </p>
        </div>
        <FooterCol
          title="Explore"
          links={[
            ['Directory', '/directory'],
            ['Marketplace', '/marketplace'],
            ['Leaderboard', '/leaderboard'],
            ['Simulator', '/simulator'],
            ['Pricing', '/pricing'],
          ]}
        />
        <FooterCol
          title="Get started"
          links={[
            ['Create a page', appUrl('/create')],
            ['Sign in', appUrl('/login')],
            ['Dashboard', appUrl('/dashboard')],
            ['Support', '/support'],
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            ['Privacy', '/privacy'],
            ['Terms', '/terms'],
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-5 py-4 text-xs text-muted-foreground">
          © Nexez — pages built for AI agents.
        </div>
      </div>
    </footer>
  )
}
