'use client'

import { Fragment, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  Compass,
  FileText,
  Grid2X2,
  Handshake,
  Layers3,
  Link2,
  PackageCheck,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Wallet,
  Wrench,
} from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { NexezLogo } from './NexezLogo'
import { PlatformAccountMenu, type PlatformViewer } from './PlatformAccountMenu'
import { agentRuntimeUrl } from '../lib/site'
import {
  commerceAttentionBadgeLabel,
  commerceAttentionIsIncomplete,
  type CommerceAttentionSummary,
} from '../lib/commerce-attention'

type PageHit = {
  id: string
  name: string
  slug: string
  is_published: boolean
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: Grid2X2, mobile: true },
  {
    href: '/dashboard/listings',
    label: 'Listings',
    icon: FileText,
    mobile: true,
    subItems: [
      { href: '/dashboard/listings', label: 'All listings' },
      { href: '/dashboard/listings?status=published', label: 'Published' },
      { href: '/dashboard/listings?status=draft', label: 'Drafts' },
    ],
  },
  { href: '/create', label: 'New Listing', icon: Plus, mobile: true },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, mobile: true },
  { href: '/simulator', label: 'Agent Lab', icon: Bot, mobile: true },
  { href: '/discovery', label: 'Discovery', icon: Compass, match: ['/discovery', '/leaderboard'] },
  { href: '/dashboard/commerce', label: 'Commerce', icon: Layers3, mobile: true },
  { href: '/dashboard/negotiations', label: 'Negotiations', icon: Handshake, mobile: true },
  { href: '/dashboard/orders', label: 'Orders', icon: PackageCheck, mobile: true },
  { href: '/dashboard/finance', label: 'Finance', icon: Wallet, mobile: true },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/tools', label: 'Tools', icon: Wrench },
  { href: '/admin', label: 'Admin Control', icon: ShieldCheck, adminOnly: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

// The heavy platform chrome (nav + search + supabase). Loaded only on platform
// routes via a dynamic import in PlatformFrame, so public/agent pages stay lean.
export default function PlatformShell({
  children,
  commerceAttention = null,
}: {
  children: ReactNode
  commerceAttention?: CommerceAttentionSummary | null
}) {
  const pathname = usePathname()
  // `pinned` keeps the rail statically open (pushes the canvas). When unpinned
  // (the default) the rail is a thin icon strip that pops out to full width on
  // hover, overlaying the canvas instead of reflowing it.
  const [pinned, setPinned] = useState(false)
  // The pin/unpin toggle animates slowly + deliberately (rail width + canvas
  // reflow together). The hover pop-out stays snappy - so we only switch to the
  // slow duration while a toggle is in flight, then reset.
  const [pinAnimating, setPinAnimating] = useState(false)
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [viewer, setViewer] = useState<PlatformViewer | null>(null)
  const [platformAdmin, setPlatformAdmin] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem('nexez-sidebar-pinned')
    if (stored) setPinned(stored === 'true')
  }, [])

  useEffect(() => () => {
    if (pinTimer.current) clearTimeout(pinTimer.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadViewer() {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      if (!data.user) {
        setAuthed(false)
        setViewer(null)
        setPlatformAdmin(false)
        return
      }
      const metadata = data.user.user_metadata as Record<string, unknown> | undefined
      const company = typeof metadata?.company === 'string' ? metadata.company.trim() : ''
      const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : ''
      const email = data.user.email?.trim() || ''
      const [{ data: admin }, { data: primaryStorefront }] = await Promise.all([
        supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', data.user.id)
          .maybeSingle<{ user_id: string }>(),
        supabase
          .from('storefronts')
          .select('logo_url')
          .eq('owner_id', data.user.id)
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

  // Dashboard items (href under /dashboard) only appear for signed-in users.
  // Public items (Create, Marketplace, Directory, Leaderboard, Simulator, Support)
  // always show. Until auth resolves, show only public items (no flash of the menu).
  const visibleNav = navItems.filter((item) =>
    (!item.href.startsWith('/dashboard') || authed === true) &&
    (!('adminOnly' in item) || item.adminOnly !== true || platformAdmin),
  )

  function togglePinned() {
    setPinAnimating(true)
    if (pinTimer.current) clearTimeout(pinTimer.current)
    pinTimer.current = setTimeout(() => setPinAnimating(false), 560)
    setPinned((current) => {
      const next = !current
      window.localStorage.setItem('nexez-sidebar-pinned', String(next))
      return next
    })
  }

  return (
    <div className="nx-dash min-h-screen bg-background text-foreground">
      <div
        className={`grid min-h-screen transition-[grid-template-columns] ease-in-out ${
          pinAnimating ? 'duration-[520ms]' : 'duration-200'
        } ${pinned ? 'md:grid-cols-[248px_minmax(0,1fr)]' : 'md:grid-cols-[72px_minmax(0,1fr)]'}`}
      >
        <aside
          className={`dashboard-sidebar group/sidebar fixed inset-x-0 bottom-0 z-50 border-t md:sticky md:top-0 md:inset-x-auto md:bottom-auto md:flex md:h-screen md:flex-col md:overflow-x-hidden md:border-r md:border-t-0 md:transition-[width] md:ease-in-out ${
            pinAnimating ? 'md:duration-[520ms]' : 'md:duration-200'
          } ${pinned ? 'md:w-[248px]' : 'md:w-[72px] md:hover:w-[248px] md:hover:shadow-2xl md:hover:shadow-black/40'}`}
        >
          <div className="hidden items-center gap-3 border-b border-border px-4 py-4 md:flex">
            <a href="/dashboard" className="flex min-w-0 flex-1 items-center gap-3" title="Nexez home">
              <div className="flex size-8 shrink-0 items-center justify-center">
                <NexezLogo className="size-6" tone="theme" />
              </div>
              <span
                className={`truncate text-sm font-medium tracking-tight transition-opacity duration-150 ${
                  pinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'
                }`}
              >
                Nexez
              </span>
            </a>
            <button
              type="button"
              onClick={togglePinned}
              className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-opacity duration-150 hover:bg-white/5 hover:text-white ${
                pinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'
              }`}
              aria-label={pinned ? 'Unpin navigation (expands on hover)' : 'Pin navigation open'}
              title={pinned ? 'Unpin navigation' : 'Pin navigation open'}
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </button>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:block md:space-y-1 md:overflow-x-visible md:p-3">
            {visibleNav.map((item) => (
              <Fragment key={item.href}>
                <ShellNavItem
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  pinned={pinned}
                  pathname={pathname}
                  match={'match' in item ? (item.match as string[]) : undefined}
                  attention={item.href === '/dashboard/commerce' ? commerceAttention : null}
                  mobileFirst={'mobile' in item && item.mobile === true}
                />
                {'subItems' in item && item.subItems && pathname.startsWith('/dashboard/listings') && pinned ? (
                  <div className="ml-7 hidden space-y-0.5 md:block">
                    {item.subItems.map((sub) => (
                      <a
                        key={sub.href}
                        href={sub.href}
                        className="nav-item flex h-8 items-center rounded-md px-3 text-xs text-muted-foreground hover:text-white"
                      >
                        {sub.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </Fragment>
            ))}
          </nav>

          <div className="mt-auto hidden p-3 md:block">
            <PlatformAccountMenu
              authState={authed === null ? 'loading' : authed ? 'signed-in' : 'signed-out'}
              viewer={viewer}
              pinned={pinned}
            />
          </div>
        </aside>

        <div className="min-w-0 pb-16 md:pb-0">
          {/* Single row from md up: search sits inline with the actions, and the
              brand comes from the sidebar rail. Below md the rail collapses to a
              bottom icon strip with no wordmark, so the phone header carries the
              lockup itself. It sits in its own row above the search field, which
              is the stacked layout phones want anyway. */}
          <header className="nx-nav sticky top-0 z-40 border-b border-border px-4 py-3 backdrop-blur-xl lg:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center justify-between gap-3 md:hidden">
                <a href="/dashboard" className="flex items-center gap-2" title="Nexez home">
                  <div className="flex size-7 items-center justify-center">
                    <NexezLogo className="size-5" tone="theme" />
                  </div>
                  <span className="text-sm font-medium">Nexez</span>
                </a>
                <div className="flex items-center gap-2">
                  <a href="/create" className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-3 text-xs font-medium text-black">
                    <Plus className="size-3.5" />
                    New
                  </a>
                  {authed === false ? (
                    <a
                      href="/login"
                      className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-white hover:bg-white/5"
                    >
                      Sign in
                    </a>
                  ) : null}
                </div>
              </div>
              {authed ? <QuickPageSearch /> : <div className="flex-1" />}
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                <a href="/create" className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-zinc-200">
                  <Plus className="size-4" />
                  New Listing
                </a>
                {authed === false ? (
                  <a
                    href="/login"
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-white hover:bg-white/5"
                  >
                    Sign in
                  </a>
                ) : null}
              </div>
            </div>
          </header>

          <div className="min-h-[calc(100vh-65px)]">{children}</div>
        </div>
      </div>
    </div>
  )
}

function ShellNavItem({
  href,
  label,
  icon: Icon,
  pinned,
  pathname,
  match,
  attention = null,
  mobileFirst = false,
}: {
  href: string
  label: string
  icon: typeof Grid2X2
  pinned: boolean
  pathname: string
  match?: string[]
  attention?: CommerceAttentionSummary | null
  mobileFirst?: boolean
}) {
  const paths = match ?? [href]
  const active =
    href === '/dashboard'
      ? pathname === '/dashboard'
      : paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const attentionLabel = attention ? commerceAttentionBadgeLabel(attention) : null
  const showAttention = Boolean(attention && (
    attention.visibleCount > 0 || attention.status !== 'complete'
  ))

  return (
    <a
      href={href}
      title={attentionLabel ? `${label} (${attentionLabel})` : label}
      aria-label={attentionLabel ? `${label}, ${attentionLabel}` : label}
      // On the mobile horizontal strip (flex), float the priority items first so
      // the common destinations are reachable without scrolling. Order is ignored
      // on the desktop rail (md:block). Nothing is ever hidden.
      style={{ order: mobileFirst ? 0 : 1 }}
      className={`nav-item flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm ${active ? 'active' : ''}`}
    >
      <span className="relative shrink-0">
        <Icon className="size-4 shrink-0" />
        {showAttention && attention ? <CommerceAttentionBadge summary={attention} /> : null}
      </span>
      <span
        className={`hidden whitespace-nowrap transition-opacity duration-150 md:block ${
          pinned ? 'md:opacity-100' : 'md:opacity-0 md:group-hover/sidebar:opacity-100'
        }`}
      >
        {label}
      </span>
    </a>
  )
}

function CommerceAttentionBadge({ summary }: { summary: CommerceAttentionSummary }) {
  const incomplete = commerceAttentionIsIncomplete(summary)
  const content = summary.status === 'unavailable' || (!summary.visibleCount && incomplete)
    ? '!'
    : summary.visibleCount > 99
      ? '99+'
      : `${summary.visibleCount}${incomplete ? '+' : ''}`

  return (
    <span
      aria-hidden="true"
      className={`absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
        summary.urgentCount ? 'bg-red-500' : 'bg-[var(--signal-solid)]'
      }`}
      style={{ color: '#fff' }}
    >
      {content}
    </span>
  )
}

function QuickPageSearch() {
  const router = useRouter()
  const [pages, setPages] = useState<PageHit[]>([])
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global shortcut: Cmd/Ctrl+K or "/" focuses page search (skip when already typing).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const inField = /^(input|textarea|select)$/i.test((event.target as HTMLElement)?.tagName ?? '') ||
        (event.target as HTMLElement)?.isContentEditable
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      const isSlash = event.key === '/' && !inField
      if (isCmdK || isSlash) {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPages() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || cancelled) return

      const { data } = await supabase
        .from('pages')
        .select('id,name,slug,is_published')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(100)
        .returns<PageHit[]>()

      if (!cancelled) setPages(data ?? [])
    }

    loadPages()
    return () => {
      cancelled = true
    }
  }, [])

  const hits = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return pages.slice(0, 5)
    return pages
      .filter((page) => `${page.name} ${page.slug}`.toLowerCase().includes(needle))
      .slice(0, 6)
  }, [pages, query])

  function openPage(page: PageHit) {
    setQuery('')
    setFocused(false)
    router.push(`/dashboard/${page.id}`)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (hits[0]) openPage(hits[0])
  }

  const showResults = focused && (query.trim().length > 0 || pages.length > 0)

  return (
    <form onSubmit={handleSubmit} className="relative w-full min-w-0 max-w-2xl">
      {/* Visually hidden: the placeholder already names the field, and a visible
          label would stack above the input and break the row alignment. */}
      <label htmlFor="platform-page-search" className="sr-only">
        Search listings
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <input
          id="platform-page-search"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (hits[0]) openPage(hits[0])
            }
            if (event.key === 'Escape') {
              setFocused(false)
            }
          }}
          placeholder="Find a listing by name or slug..."
          className="h-10 w-full rounded-md border border-border bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          aria-describedby="platform-page-search-hint"
        />
      </div>
      {/* Keyboard hint is desktop-only - hide on phones and tablets (no physical
          keyboard there) so the row stays the height of the input itself. */}
      <p id="platform-page-search-hint" className="mt-1 hidden items-center gap-1.5 text-[11px] text-muted-foreground xl:flex">
        Press <kbd className="rounded border border-border bg-black/40 px-1 font-mono text-[10px]">⌘K</kbd> to search, Enter to open the first match.
      </p>
      {showResults ? (
        <div className="absolute left-0 right-0 top-[44px] z-50 overflow-hidden rounded-md border border-border bg-[#111] shadow-2xl">
          {hits.length ? (
            hits.map((page, index) => (
              <div
                key={page.id}
                className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 hover:bg-white/[0.06]"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openPage(page)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="block truncate text-white">{page.name}</span>
                      {index === 0 ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">Enter</span> : null}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">/{page.slug}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${page.is_published ? 'badge-published' : 'badge-draft'}`}>
                    {page.is_published ? 'Live' : 'Draft'}
                  </span>
                </button>
                {page.is_published ? (
                  <a
                    href={agentRuntimeUrl(`/${page.slug}`)}
                    onMouseDown={(event) => event.preventDefault()}
                    className="mr-2 shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
                  >
                    Public
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground">No matching listings.</div>
          )}
        </div>
      ) : null}
    </form>
  )
}
