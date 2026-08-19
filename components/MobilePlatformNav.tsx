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
  { href: '/dashboard/negotiations', label: 'Negotiations', icon: Handshake },
  { href: '/dashboard/finance', label: 'Finance', icon: Wallet },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/tools', label: 'Tools', icon: Wrench },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/admin', label: 'Admin Control', icon: ShieldCheck, adminOnly: true },
  { href: '/support', label: 'Support', icon: HelpCircle },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

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
                  badge={item.href === '/dashboard/negotiations' ? openNegotiations : 0}
                  onNavigate={() => closeMenu(false)}
                />
              ))}
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
        >
          <span className="relative">
            {menuOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
            {openNegotiations > 0 ? <Badge count={openNegotiations} /> : null}
          </span>
          <span>Menu</span>
        </button>
      </nav>
    </>
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
      className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none text-[var(--color-pure-white)]"
      style={{ backgroundColor: '#DC4F1E' }}
      aria-label={`${count} open`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
