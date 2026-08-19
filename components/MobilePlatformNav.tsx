'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Bot,
  Compass,
  CreditCard,
  FileText,
  Grid2X2,
  Handshake,
  HelpCircle,
  Link2,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { createClient } from '../utils/supabase/client'

type MobileNavItem = {
  href: string
  label: string
  shortLabel?: string
  icon: typeof Grid2X2
  match?: string[]
  adminOnly?: boolean
}

const mobileNavItems: MobileNavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: Grid2X2 },
  { href: '/dashboard/listings', label: 'Listings', icon: FileText },
  { href: '/create', label: 'New Listing', shortLabel: 'New', icon: Plus },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/simulator', label: 'Agent Lab', icon: Bot },
  { href: '/discovery', label: 'Discovery', icon: Compass, match: ['/discovery', '/leaderboard'] },
  { href: '/dashboard/negotiations', label: 'Negotiations', shortLabel: 'Deals', icon: Handshake },
  { href: '/dashboard/finance', label: 'Finance', icon: Wallet },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/tools', label: 'Tools', icon: Wrench },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/admin', label: 'Admin Control', icon: ShieldCheck, adminOnly: true },
  { href: '/support', label: 'Support', icon: HelpCircle },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

const signedInPrimaryHrefs = new Set(['/dashboard', '/dashboard/listings', '/dashboard/negotiations'])
const signedOutPrimaryHrefs = new Set(['/create', '/discovery', '/simulator'])

function isItemActive(item: MobileNavItem, pathname: string) {
  const paths = item.match ?? [item.href]
  if (item.href === '/dashboard') return pathname === '/dashboard'
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function MobilePlatformNav() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [openNegotiations, setOpenNegotiations] = useState(0)
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
      setAuthed(Boolean(user))
      if (!user) {
        setPlatformAdmin(false)
        setOpenNegotiations(0)
        return
      }

      const [{ data: admin }, { count }] = await Promise.all([
        supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle<{ user_id: string }>(),
        supabase
          .from('agent_negotiations')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id)
          .in('status', ['negotiation', 'agreement_proposed', 'held']),
      ])

      if (!cancelled) {
        setPlatformAdmin(Boolean(admin))
        setOpenNegotiations(count ?? 0)
      }
    }

    loadViewer().catch(() => {
      if (!cancelled) {
        setAuthed(false)
        setPlatformAdmin(false)
        setOpenNegotiations(0)
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

  const primaryHrefs = authed === true ? signedInPrimaryHrefs : signedOutPrimaryHrefs
  const primaryItems = visibleItems.filter((item) => primaryHrefs.has(item.href))
  const moreItems = visibleItems.filter(
    (item) => !primaryHrefs.has(item.href) && !(authed === true && item.href === '/create'),
  )
  const moreActive = moreItems.some((item) => isItemActive(item, pathname))

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
            className="absolute inset-x-3 mx-auto max-h-[min(68vh,560px)] max-w-md overflow-y-auto rounded-2xl border border-border bg-[var(--bg-2)] p-3 shadow-2xl"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}
          >
            <div className="mb-2 flex items-center justify-between px-1 py-1">
              <div>
                <p id="mobile-platform-nav-title" className="text-sm font-medium text-white">Navigate</p>
                <p className="text-xs text-muted-foreground">Everything else, one tap away.</p>
              </div>
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
              {moreItems.map((item) => (
                <MobileSheetLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  badge={item.href === '/dashboard/negotiations' ? openNegotiations : 0}
                  onNavigate={() => closeMenu(false)}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-3 z-[70] mx-auto max-w-md md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        aria-label="Mobile platform navigation"
      >
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-[var(--bg-2)] p-1.5 shadow-2xl backdrop-blur-xl">
          {primaryItems.map((item) => (
            <MobileBarLink
              key={item.href}
              item={item}
              pathname={pathname}
              badge={item.href === '/dashboard/negotiations' ? openNegotiations : 0}
            />
          ))}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors ${
              menuOpen || moreActive
                ? 'bg-[var(--inverse-bg)] text-[var(--inverse-fg)]'
                : 'text-muted-foreground hover:bg-white/[0.05] hover:text-white'
            }`}
            aria-expanded={menuOpen}
            aria-controls="mobile-platform-nav-sheet"
          >
            <span className="relative">
              {menuOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
              {openNegotiations > 0 && !primaryHrefs.has('/dashboard/negotiations') ? (
                <Badge count={openNegotiations} />
              ) : null}
            </span>
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </>
  )
}

function MobileBarLink({ item, pathname, badge = 0 }: { item: MobileNavItem; pathname: string; badge?: number }) {
  const Icon = item.icon
  const active = isItemActive(item, pathname)

  return (
    <a
      href={item.href}
      className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-[var(--inverse-bg)] text-[var(--inverse-fg)]'
          : 'text-muted-foreground hover:bg-white/[0.05] hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
      title={badge > 0 ? `${item.label} (${badge} open)` : item.label}
    >
      <span className="relative">
        <Icon className="size-[18px]" />
        {badge > 0 ? <Badge count={badge} /> : null}
      </span>
      <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
    </a>
  )
}

function MobileSheetLink({
  item,
  pathname,
  badge = 0,
  onNavigate,
}: {
  item: MobileNavItem
  pathname: string
  badge?: number
  onNavigate: () => void
}) {
  const Icon = item.icon
  const active = isItemActive(item, pathname)

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
      title={badge > 0 ? `${item.label} (${badge} open)` : item.label}
    >
      <span className="relative shrink-0">
        <Icon className="size-4" />
        {badge > 0 ? <Badge count={badge} /> : null}
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
    </a>
  )
}

function Badge({ count }: { count: number }) {
  return (
    <span
      className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--signal-solid)] px-1 text-[9px] font-semibold leading-none text-[var(--color-pure-white)]"
      aria-label={`${count} open`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
