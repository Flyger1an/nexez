'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { NexezLockup } from './NexezLogo'
import { ThemeToggle } from './ThemeToggle'
import { hasSupabaseAuthCookieInDocument } from '../lib/auth-cookie'
import { appUrl } from '../lib/site'
import { MARKETPLACE_DISCOVERY_ENABLED } from '../lib/marketplace-discovery'

// Marketing chrome for the nexez.ai surfaces (optional Discovery, Agent Lab,
// support, and legal).
// Modeled on the homepage nav so the marketing domain stays visually consistent.

// Cookie-presence heuristic on purpose - importing the supabase-js client here put
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
  ...(MARKETPLACE_DISCOVERY_ENABLED ? [{ label: 'Discovery', href: '/discovery' }] : []),
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
          <NexezLockup className="h-[17px] w-[102px] shrink-0" />
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
            aria-label={open ? 'Close menu' : 'Open menu'}
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
          <ThemeToggle className="nav-bar-theme" />
          {authed === false && (
            <a href={appUrl('/login')} className="btn-secondary btn-sm sign-in">
              Sign in
            </a>
          )}
          {authed === null ? (
            <span aria-hidden="true" className="btn-primary btn-sm nav-bar-cta" style={{ opacity: 0, pointerEvents: 'none' }}>
              Get listed
            </span>
          ) : (
            <a href={appUrl(authed ? '/dashboard' : '/create')} className="btn-primary btn-sm nav-bar-cta">
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
          <div className="nav-sheet-footer">
            <div className="nav-sheet-theme-row">
              <span>Theme</span>
              <ThemeToggle />
            </div>
            {authed !== null ? (
              <a
                href={appUrl(authed ? '/dashboard' : '/create')}
                className="btn-primary nav-sheet-cta"
                onClick={() => setOpen(false)}
              >
                {authed ? 'Open dashboard' : 'List your offers'}
              </a>
            ) : null}
          </div>
        </div>
      </nav>

      {children}

      <MarketingFooter authed={authed} />
    </div>
  )
}

function FooterLinks({ links }: { links: Array<[string, string]> }) {
  return (
    <ul className="marketing-footer-links">
      {links.map(([label, href]) => (
        <li key={href + label}>
          <a href={href} className="text-muted-foreground transition-colors hover:text-white">
            {label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <>
      <div className="hidden sm:block">
        <div className="mb-3 text-xs uppercase tracking-widest text-zinc-500">{title}</div>
        <FooterLinks links={links} />
      </div>
      <details className="marketing-footer-col sm:hidden">
        <summary>
          <span>{title}</span>
          <span aria-hidden="true" className="marketing-footer-plus">+</span>
        </summary>
        <FooterLinks links={links} />
      </details>
    </>
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
    <footer className="marketing-footer mt-20 border-t border-border">
      <div className="marketing-footer-grid mx-auto grid max-w-7xl gap-8 px-5 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="marketing-footer-brand">
          <a href="/" className="inline-flex items-center text-foreground" title="Nexez home">
            <NexezLockup className="h-[18px] w-[108px]" />
          </a>
          <p className="mt-3 max-w-xs text-muted-foreground">
            Help people and AI find, understand, and buy from your business.
          </p>
        </div>
        <FooterCol
          title="Explore"
          links={[
            ['Scan your site', '/scan'],
            ['How it works', '/how-it-works'],
            ['Use cases', '/use-cases'],
            ['Examples', '/examples'],
            ...(MARKETPLACE_DISCOVERY_ENABLED
              ? [
                  ['Discovery', '/discovery'] as [string, string],
                  ['Leaderboard', '/leaderboard'] as [string, string],
                ]
              : []),
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
            ['Platform documentation', '/docs'],
            ['Agent readiness', '/agent-readiness'],
            ['Agent access', '/agents'],
            ['Integrations', '/integrations'],
            ['Developers', '/developers'],
            ['Buyer approval UX', '/developers/buyer-approval'],
            ['Security', '/security'],
            ['Compare', '/compare'],
            ['Enterprise', '/enterprise'],
            ['Privacy', '/privacy'],
            ['SMS notifications', '/sms-notifications'],
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
