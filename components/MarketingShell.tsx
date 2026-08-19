'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { NexezLockup } from './NexezLogo'
import { ThemeToggle } from './ThemeToggle'
import { hasSupabaseAuthCookieInDocument } from '../lib/auth-cookie'
import { appUrl } from '../lib/site'

// Marketing chrome for the nexez.ai surfaces (discovery/simulator/support/legal).
// Modeled on the homepage nav so the marketing domain stays visually consistent.

// Cookie-presence heuristic on purpose — importing the supabase-js client here put
// its entire browser bundle (~240KB raw) on EVERY marketing page just to pick the
// nav CTA. Same fidelity as the proxy/PlatformFrame checks: a stale cookie shows
// the signed-in CTA, and the real auth gate still validates on click-through.
function useAuthedUser(): boolean | null {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    // Post-hydration read (an initializer would mismatch the static server HTML).
    setAuthed(hasSupabaseAuthCookieInDocument())
  }, [])
  return authed
}

const navLinks = [
  { label: 'Scan your site', href: '/scan' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Use cases', href: '/use-cases' },
  { label: 'Discovery', href: '/discovery' },
  { label: 'Learn', href: '/learn' },
  { label: 'Pricing', href: '/pricing' },
]

export function MarketingShell({ children }: { children: ReactNode }) {
  const authed = useAuthedUser()
  const [open, setOpen] = useState(false)
  const [enhanced, setEnhanced] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  // JS hydrated -> enable the collapse-to-menu. Without JS the link row stays
  // visible (CSS only hides it under .has-menu), so nav never disappears.
  useEffect(() => setEnhanced(true), [])

  // Close the mobile sheet on outside-click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="min-h-screen">
      <nav
        ref={navRef}
        aria-label="Primary"
        className={`glassnav${enhanced ? ' has-menu' : ''}${open ? ' open' : ''}`}
      >
        <a href="/" className="logo" title="Nexez home">
          <NexezLockup className="h-[17px] w-[132px] shrink-0" />
        </a>

        <div className="navlinks">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="nav-actions">
          <button
            type="button"
            className="menu-btn"
            aria-label="Open menu"
            title="Menu"
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((o) => !o)
            }}
          >
            ☰
          </button>
          <ThemeToggle />
          {authed === false && (
            <a href={appUrl('/login')} className="btn-secondary btn-sm sign-in">
              Sign in
            </a>
          )}
          {authed === null ? (
            <span aria-hidden="true" className="btn-primary btn-sm" style={{ opacity: 0, pointerEvents: 'none' }}>
              Get listed
            </span>
          ) : (
            <a href={appUrl(authed ? '/dashboard' : '/create')} className="btn-primary btn-sm">
              {authed ? 'Dashboard' : 'Get listed'}
            </a>
          )}
        </div>

        <div className="navsheet" id="nav-sheet">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          {authed === false && (
            <>
              <hr className="hair" />
              <a href={appUrl('/login')} onClick={() => setOpen(false)}>
                Sign in
              </a>
            </>
          )}
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
          ['Create a listing', appUrl('/create')],
          ['Dashboard', appUrl('/dashboard')],
          ['Support', '/support'],
        ]
      : [
          ['Create a listing', appUrl('/create')],
          ['Sign in', appUrl('/login')],
          ['Dashboard', appUrl('/dashboard')],
          ['Support', '/support'],
        ]

  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <a href="/" className="inline-flex items-center text-foreground" title="Nexez home">
            <NexezLockup className="h-[18px] w-[139px]" />
          </a>
          <p className="mt-3 max-w-xs text-muted-foreground">
            The commerce layer for AI agents. Get discovered, get understood, get bought.
          </p>
        </div>
        <FooterCol
          title="Explore"
          links={[
            ['Scan your site', '/scan'],
            ['How it works', '/how-it-works'],
            ['Use cases', '/use-cases'],
            ['Examples', '/examples'],
            ['Discovery', '/discovery'],
            ['Leaderboard', '/leaderboard'],
            ['Simulator', '/simulator'],
            ['Learn', '/learn'],
            ['llms.txt generator', '/tools/llms-txt-generator'],
            ['Agent access', '/agents'],
            ['Pricing', '/pricing'],
          ]}
        />
        <FooterCol
          title="Get started"
          links={gettingStartedLinks}
        />
        <FooterCol
          title="Trust"
          links={[
            ['Agent readiness', '/agent-readiness'],
            ['Agent access', '/agents'],
            ['Integrations', '/integrations'],
            ['Developers', '/developers'],
            ['Buyer approval UX', '/developers/buyer-approval'],
            ['Security', '/security'],
            ['Compare', '/compare'],
            ['Enterprise', '/enterprise'],
            ['Privacy', '/privacy'],
            ['Terms', '/terms'],
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-5 py-4 text-xs text-muted-foreground">
          © Nexez - listings built for AI agents.
        </div>
      </div>
    </footer>
  )
}
