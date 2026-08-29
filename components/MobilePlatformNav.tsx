'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Bot,
  Compass,
  FileText,
  Grid2X2,
  Handshake,
  Layers3,
  Link2,
  LogIn,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  Settings,
  ShieldCheck,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { createClient } from '../utils/supabase/client'
import {
  ACCOUNT_PRIMARY_LINKS,
  ACCOUNT_RESOURCE_LINKS,
  PlatformAccountAvatar,
  type PlatformViewer,
} from './PlatformAccountMenu'
import { ThemeToggle } from './ThemeToggle'
import {
  commerceAttentionBadgeLabel,
  commerceAttentionIsIncomplete,
  type CommerceAttentionSummary,
} from '../lib/commerce-attention'

type MobileNavItem = {
  href: string
  label: string
  icon: typeof Grid2X2
  match?: string[]
  adminOnly?: boolean
}

const mobileNavItems: MobileNavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: Grid2X2 },
  { href: '/dashboard/listings', label: 'Listings', icon: FileText },
  { href: '/create', label: 'New Listing', icon: Plus },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/simulator', label: 'Agent Lab', icon: Bot },
  { href: '/discovery', label: 'Discovery', icon: Compass, match: ['/discovery', '/leaderboard'] },
  { href: '/dashboard/commerce', label: 'Commerce', icon: Layers3 },
  { href: '/dashboard/negotiations', label: 'Negotiations', icon: Handshake },
  { href: '/dashboard/orders', label: 'Orders', icon: PackageCheck },
  { href: '/dashboard/finance', label: 'Finance', icon: Wallet },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/tools', label: 'Tools', icon: Wrench },
  { href: '/admin', label: 'Admin Control', icon: ShieldCheck, adminOnly: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function isItemActive(item: MobileNavItem, pathname: string) {
  const paths = item.match ?? [item.href]
  if (item.href === '/dashboard') return pathname === '/dashboard'
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function MobilePlatformNav({
  commerceAttention = null,
}: {
  commerceAttention?: CommerceAttentionSummary | null
}) {
  const pathname = usePathname()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [viewer, setViewer] = useState<PlatformViewer | null>(null)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadViewer() {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      if (cancelled) return

      const user = data.user
      if (!user) {
        setAuthed(false)
        setViewer(null)
        setPlatformAdmin(false)
        return
      }

      const metadata = user.user_metadata as Record<string, unknown> | undefined
      const company = typeof metadata?.company === 'string' ? metadata.company.trim() : ''
      const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : ''
      const email = user.email?.trim() || ''
      const [{ data: admin }, { data: primaryStorefront }] = await Promise.all([
        supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle<{ user_id: string }>(),
        supabase
          .from('storefronts')
          .select('logo_url')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle<{ logo_url: string | null }>(),
      ])
      if (!cancelled) {
        setViewer({
          displayName: company || fullName || email.split('@')[0] || 'Nexez account',
          email,
          logoUrl: primaryStorefront?.logo_url ?? null,
        })
        setPlatformAdmin(Boolean(admin))
        setAuthed(true)
      }
    }

    loadViewer().catch(() => {
      if (!cancelled) {
        setAuthed(false)
        setViewer(null)
        setPlatformAdmin(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        window.requestAnimationFrame(() => menuButtonRef.current?.focus())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [menuOpen])

  const visibleItems = useMemo(
    () =>
      mobileNavItems.filter(
        (item) =>
          (!item.href.startsWith('/dashboard') || authed === true) &&
          (!item.adminOnly || platformAdmin),
      ),
    [authed, platformAdmin],
  )

  function closeMenu(restoreFocus = false) {
    setMenuOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus())
    }
  }

  return (
    <>
      {menuOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-platform-nav-title">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
            aria-label="Close navigation menu"
            onClick={() => closeMenu(true)}
          />
          <section
            id="mobile-platform-nav-sheet"
            className="absolute inset-x-3 mx-auto max-h-[min(72vh,620px)] max-w-md overflow-y-auto rounded-2xl border border-border bg-[var(--bg-2)] p-3 shadow-2xl"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 82px)' }}
          >
            <div className="mb-2 flex items-center justify-between px-1 py-1">
              <p id="mobile-platform-nav-title" className="text-sm font-medium text-white">Navigate</p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => closeMenu(true)}
                className="inline-flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-white"
                aria-label="Close navigation menu"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {visibleItems.map((item) => (
                <MobileSheetLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  attention={item.href === '/dashboard/commerce' ? commerceAttention : null}
                  onNavigate={() => closeMenu(false)}
                />
              ))}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-center gap-3 px-2 py-2">
                <PlatformAccountAvatar viewer={viewer} loading={authed === null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {authed ? viewer?.displayName || 'Nexez account' : 'Nexez'}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {authed ? viewer?.email || 'Signed in' : authed === null ? 'Loading account' : 'Sign in for your workspace'}
                  </span>
                </span>
              </div>

              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {[...ACCOUNT_PRIMARY_LINKS, ...ACCOUNT_RESOURCE_LINKS]
                  .filter((item) => !item.signedInOnly || authed === true)
                  .map((item) => (
                    <MobileUtilityLink key={item.href} item={item} onNavigate={() => closeMenu(false)} />
                  ))}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-[var(--fill-1)] px-3 py-2">
                <span className="text-sm text-foreground">Theme</span>
                <ThemeToggle />
              </div>

              {authed ? (
                <form action="/auth/signout" method="post" className="mt-2">
                  <button
                    type="submit"
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out
                  </button>
                </form>
              ) : authed === false ? (
                <a
                  href="/login"
                  onClick={() => closeMenu(false)}
                  className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground"
                >
                  <LogIn className="size-4" aria-hidden="true" />
                  Sign in
                </a>
              ) : null}

              <a
                href={authed ? '/dashboard/settings#agent-surfaces' : '/docs'}
                onClick={() => closeMenu(false)}
                className="mt-1 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-[var(--signal)] transition-colors hover:bg-[var(--fill-2)]"
              >
                <span className="size-2 rounded-full bg-[var(--ready)]" aria-hidden="true" />
                Agent layer active
              </a>
            </div>
          </section>
        </div>
      ) : null}

      <nav
        className="fixed left-1/2 z-[70] -translate-x-1/2 md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
        aria-label="Mobile platform navigation"
      >
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className={`relative inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 px-4 text-sm font-medium shadow-2xl backdrop-blur-xl transition-[background-color,color,transform] active:scale-[0.98] ${
            menuOpen
              ? 'bg-[var(--inverse-bg)] text-[var(--inverse-fg)]'
              : 'bg-[var(--bg-2)] text-white hover:bg-white/[0.05]'
          }`}
          style={{ borderColor: '#FF6A33' }}
          aria-expanded={menuOpen}
          aria-controls="mobile-platform-nav-sheet"
          aria-label={menuOpen
            ? 'Close navigation menu'
            : commerceAttention
              ? `Open navigation menu, ${commerceAttentionBadgeLabel(commerceAttention)}`
              : 'Open navigation menu'}
        >
          <span className="relative">
            {menuOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
            {commerceAttention && (commerceAttention.visibleCount > 0 || commerceAttention.status !== 'complete')
              ? <Badge summary={commerceAttention} />
              : null}
          </span>
          <span>Menu</span>
        </button>
      </nav>
    </>
  )
}

function MobileUtilityLink({
  item,
  onNavigate,
}: {
  item: { href: string; label: string; icon: typeof Grid2X2 }
  onNavigate: () => void
}) {
  const Icon = item.icon
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{item.label}</span>
    </a>
  )
}

function MobileSheetLink({
  item,
  pathname,
  attention = null,
  onNavigate,
}: {
  item: MobileNavItem
  pathname: string
  attention?: CommerceAttentionSummary | null
  onNavigate: () => void
}) {
  const Icon = item.icon
  const active = isItemActive(item, pathname)
  const attentionLabel = attention ? commerceAttentionBadgeLabel(attention) : null

  return (
    <a
      href={item.href}
      onClick={onNavigate}
      className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active
          ? 'bg-[var(--inverse-bg)] text-[var(--inverse-fg)]'
          : 'text-muted-foreground hover:bg-white/[0.05] hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
      title={attentionLabel ? `${item.label} (${attentionLabel})` : item.label}
      aria-label={attentionLabel ? `${item.label}, ${attentionLabel}` : item.label}
    >
      <span className="relative shrink-0">
        <Icon className="size-4" />
        {attention && (attention.visibleCount > 0 || attention.status !== 'complete')
          ? <Badge summary={attention} />
          : null}
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
    </a>
  )
}

function Badge({ summary }: { summary: CommerceAttentionSummary }) {
  const incomplete = commerceAttentionIsIncomplete(summary)
  const content = summary.status === 'unavailable' || (!summary.visibleCount && incomplete)
    ? '!'
    : summary.visibleCount > 99
      ? '99+'
      : `${summary.visibleCount}${incomplete ? '+' : ''}`

  return (
    <span
      className={`absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none text-[var(--color-pure-white)] ${
        summary.urgentCount ? 'bg-red-500' : 'bg-[var(--signal-solid)]'
      }`}
      aria-hidden="true"
    >
      {content}
    </span>
  )
}
