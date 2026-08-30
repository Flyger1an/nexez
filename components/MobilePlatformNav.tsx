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
import Link from 'next/link'
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

type MobilePanel = 'navigation' | 'account'

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
  const [activePanel, setActivePanel] = useState<MobilePanel | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const accountButtonRef = useRef<HTMLButtonElement>(null)
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
    setActivePanel(null)
  }, [pathname])

  useEffect(() => {
    if (!activePanel) return

    const previousOverflow = document.body.style.overflow
    const trigger = activePanel === 'account' ? accountButtonRef.current : menuButtonRef.current
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActivePanel(null)
        window.requestAnimationFrame(() => trigger?.focus())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [activePanel])

  const visibleItems = useMemo(
    () =>
      mobileNavItems.filter(
        (item) =>
          (!item.href.startsWith('/dashboard') || authed === true) &&
          (!item.adminOnly || platformAdmin),
      ),
    [authed, platformAdmin],
  )

  function closePanel(restoreFocus = false) {
    const trigger = activePanel === 'account' ? accountButtonRef.current : menuButtonRef.current
    setActivePanel(null)
    if (restoreFocus) {
      window.requestAnimationFrame(() => trigger?.focus())
    }
  }

  function togglePanel(panel: MobilePanel) {
    setActivePanel((current) => current === panel ? null : panel)
  }

  const signedIn = authed === true
  const accountName = signedIn ? viewer?.displayName || 'Nexez account' : 'Nexez'
  const accountDetail = authed === null
    ? 'Loading account'
    : signedIn
      ? viewer?.email || 'Signed in'
      : 'Sign in for your workspace'
  const panelTitle = activePanel === 'account' ? 'Account' : 'Navigate'
  const panelLabelId = activePanel ? `mobile-platform-${activePanel}-title` : undefined
  const closeLabel = activePanel === 'account' ? 'Close account menu' : 'Close navigation menu'

  return (
    <>
      {activePanel ? (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-labelledby={panelLabelId}>
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
            aria-label={closeLabel}
            onClick={() => closePanel(true)}
          />
          <section
            id={`mobile-platform-${activePanel}-sheet`}
            className="absolute inset-x-3 mx-auto max-h-[min(72vh,520px)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-[var(--bg-2)] p-3 shadow-2xl shadow-black/35"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 78px)' }}
          >
            <div className="mb-2 flex items-center justify-between px-1 py-1">
              <p id={panelLabelId} className="text-sm font-semibold text-foreground">{panelTitle}</p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => closePanel(true)}
                className="inline-flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground"
                aria-label={closeLabel}
              >
                <X className="size-4" />
              </button>
            </div>

            {activePanel === 'navigation' ? (
              <div className="grid grid-cols-2 gap-1.5">
                {visibleItems.map((item) => (
                  <MobileSheetLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    attention={item.href === '/dashboard/commerce' ? commerceAttention : null}
                    onNavigate={() => closePanel(false)}
                  />
                ))}
              </div>
            ) : (
              <MobileAccountPanel
                authed={authed}
                viewer={viewer}
                accountName={accountName}
                accountDetail={accountDetail}
                onNavigate={() => closePanel(false)}
              />
            )}
          </section>
        </div>
      ) : null}

      <nav
        className="fixed left-1/2 z-[70] -translate-x-1/2 md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
        aria-label="Mobile platform controls"
      >
        <div
          className="flex h-14 items-center gap-1 rounded-full border-2 bg-[var(--bg-2)] p-1 shadow-2xl shadow-black/30 backdrop-blur-xl"
          style={{ borderColor: '#FF6A33' }}
        >
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => togglePanel('navigation')}
            className={`relative inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-[background-color,color,transform] active:scale-[0.98] ${
              activePanel === 'navigation'
                ? 'bg-[var(--inverse-bg)] text-[var(--inverse-fg)]'
                : 'text-foreground hover:bg-[var(--fill-2)]'
            }`}
            aria-expanded={activePanel === 'navigation'}
            aria-controls="mobile-platform-navigation-sheet"
            aria-label={activePanel === 'navigation'
              ? 'Close navigation menu'
              : commerceAttention
                ? `Open navigation menu, ${commerceAttentionBadgeLabel(commerceAttention)}`
                : 'Open navigation menu'}
          >
            <span className="relative">
              {activePanel === 'navigation' ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
              {commerceAttention && (commerceAttention.visibleCount > 0 || commerceAttention.status !== 'complete')
                ? <Badge summary={commerceAttention} />
                : null}
            </span>
            <span>Menu</span>
          </button>

          <span className="h-6 w-px bg-border" aria-hidden="true" />

          <button
            ref={accountButtonRef}
            type="button"
            onClick={() => togglePanel('account')}
            className={`flex size-11 items-center justify-center rounded-full transition-[background-color,transform] active:scale-[0.96] ${
              activePanel === 'account' ? 'bg-[var(--fill-2)]' : 'hover:bg-[var(--fill-2)]'
            }`}
            aria-expanded={activePanel === 'account'}
            aria-controls="mobile-platform-account-sheet"
            aria-label={activePanel === 'account' ? 'Close account menu' : 'Open account menu'}
          >
            <PlatformAccountAvatar viewer={viewer} loading={authed === null} />
          </button>
        </div>
      </nav>
    </>
  )
}

function MobileAccountPanel({
  authed,
  viewer,
  accountName,
  accountDetail,
  onNavigate,
}: {
  authed: boolean | null
  viewer: PlatformViewer | null
  accountName: string
  accountDetail: string
  onNavigate: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-[var(--fill-1)] p-3">
        <PlatformAccountAvatar viewer={viewer} loading={authed === null} size="large" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{accountName}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{accountDetail}</span>
        </span>
        {authed ? (
          <Link
            href="/dashboard/settings#workspace"
            onClick={onNavigate}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground"
            aria-label="Open platform settings"
          >
            <Settings className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="Account shortcuts"
        className="mt-2 grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-1"
      >
        {[...ACCOUNT_PRIMARY_LINKS, ...ACCOUNT_RESOURCE_LINKS]
          .filter((item) => !item.signedInOnly || authed === true)
          .map((item) => (
            <MobileUtilityLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
      </nav>

      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-[var(--fill-1)] px-3 py-2">
        <span className="text-sm font-medium text-foreground">Theme</span>
        <ThemeToggle />
      </div>

      {authed ? (
        <form action="/auth/signout" method="post" className="mt-1">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      ) : authed === false ? (
        <Link
          href="/login"
          onClick={onNavigate}
          className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Sign in
        </Link>
      ) : null}

      <Link
        href={authed ? '/dashboard/settings#agent-surfaces' : '/docs'}
        onClick={onNavigate}
        className="mt-0.5 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--signal)] transition-colors hover:bg-[var(--fill-2)]"
      >
        <span className="size-2 rounded-full bg-[var(--ready)]" aria-hidden="true" />
        Agent layer active
      </Link>
    </div>
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
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--fill-2)] hover:text-foreground sm:gap-3 sm:px-3 sm:text-sm"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
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
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-[var(--inverse-bg)] text-[var(--inverse-fg)]'
          : 'text-muted-foreground hover:bg-[var(--fill-2)] hover:text-foreground'
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
    </Link>
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
