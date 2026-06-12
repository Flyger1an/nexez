'use client'

import { ReactNode, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { NexezLogo } from './NexezLogo'
import { ThemeToggle } from './ThemeToggle'
import { appUrl } from '../lib/site'
import { createClient } from '../utils/supabase/client'

// Marketing chrome for the nexez.ai surfaces (discovery/simulator/support/legal).
// Modeled on the homepage nav so the marketing domain stays visually consistent.

function useAuthedUser(): boolean | null {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setAuthed(Boolean(data.user))
      })
      .catch(() => {
        if (active) setAuthed(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthed(Boolean(session?.user))
    })

    return () => {
      active = false
      subscription.unsubscribe()
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
  const authed = useAuthedUser()
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
              {authed === false && (
                <a href={appUrl('/login')} className="btn-secondary h-9 px-3">Sign in</a>
              )}
            </div>
            {authed === null ? (
              <div aria-hidden="true" className="h-9 w-28 rounded-md border border-border bg-white/5" />
            ) : (
              <a href={appUrl(authed ? '/dashboard' : '/onboard')} className="btn-primary h-9 px-3">
                {authed ? 'Dashboard' : 'Get started'}
                <ArrowRight className="size-4" />
              </a>
            )}
          </div>
        </div>
      </nav>

      {children}

      <MarketingFooter authed={authed} />
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

function MarketingFooter({ authed }: { authed: boolean | null }) {
  const gettingStartedLinks: Array<[string, string]> =
    authed === true
      ? [
          ['Create a page', appUrl('/create')],
          ['Dashboard', appUrl('/dashboard')],
          ['Support', '/support'],
        ]
      : [
          ['Create a page', appUrl('/create')],
          ['Sign in', appUrl('/login')],
          ['Dashboard', appUrl('/dashboard')],
          ['Support', '/support'],
        ]

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
          links={gettingStartedLinks}
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
