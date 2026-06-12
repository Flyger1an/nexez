'use client'

import { Fragment, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gauge,
  FileText,
  Grid2X2,
  Handshake,
  HelpCircle,
  Link2,
  LogOut,
  Plus,
  Search,
  Settings,
  Sparkles,
  Store,
  Trophy,
  Wrench,
} from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { ThemeToggle } from './ThemeToggle'
import { NexezLogo } from './NexezLogo'

type PageHit = {
  id: string
  name: string
  slug: string
  is_published: boolean
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: Grid2X2, mobile: true },
  {
    href: '/dashboard/pages',
    label: 'Pages',
    icon: FileText,
    mobile: true,
    subItems: [
      { href: '/dashboard/pages', label: 'All pages' },
      { href: '/dashboard/pages?status=published', label: 'Published' },
      { href: '/dashboard/pages?status=draft', label: 'Drafts' },
    ],
  },
  { href: '/create', label: 'Create Page', icon: Plus, mobile: true },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, mobile: true },
  { href: '/simulator', label: 'Simulator', icon: Bot, mobile: true },
  { href: '/marketplace', label: 'Marketplace', icon: Store },
  { href: '/directory', label: 'Directory', icon: Search },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/dashboard/competitors', label: 'Competitors', icon: Gauge },
  { href: '/dashboard/negotiations', label: 'Negotiations', icon: Handshake },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/tools', label: 'Tools', icon: Wrench },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/support', label: 'Support', icon: HelpCircle, mobile: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

// The heavy platform chrome (nav + search + supabase). Loaded only on platform
// routes via a dynamic import in PlatformFrame, so public/agent pages stay lean.
export default function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem('nexez-sidebar-collapsed')
    if (stored) setCollapsed(stored === 'true')
  }, [])

  useEffect(() => {
    let cancelled = false
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setAuthed(Boolean(data.user))
      })
      .catch(() => {
        if (!cancelled) setAuthed(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Dashboard items (href under /dashboard) only appear for signed-in users.
  // Public items (Create, Marketplace, Directory, Leaderboard, Simulator, Support)
  // always show. Until auth resolves, show only public items (no flash of the menu).
  const visibleNav = navItems.filter((item) => !item.href.startsWith('/dashboard') || authed === true)

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem('nexez-sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className={`grid min-h-screen transition-[grid-template-columns] duration-200 ${
          collapsed ? 'md:grid-cols-[72px_minmax(0,1fr)]' : 'md:grid-cols-[248px_minmax(0,1fr)]'
        }`}
      >
        <aside className="dashboard-sidebar fixed inset-x-0 bottom-0 z-50 border-t md:sticky md:top-0 md:inset-x-auto md:bottom-auto md:flex md:h-screen md:flex-col md:border-r md:border-t-0">
          <div className="hidden items-center gap-3 border-b border-border px-4 py-4 md:flex">
            <a href="/dashboard" className="flex min-w-0 flex-1 items-center gap-3" title="Nexez home">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white text-black">
                <NexezLogo className="size-6" />
              </div>
              {!collapsed ? <span className="truncate text-sm font-medium tracking-tight">Nexez</span> : null}
            </a>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-white/5 hover:text-white"
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </button>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:block md:space-y-1 md:overflow-x-visible md:p-3">
            {visibleNav.map((item) => (
              <Fragment key={item.href}>
                <ShellNavItem
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  pathname={pathname}
                />
                {'subItems' in item && item.subItems && pathname.startsWith('/dashboard/pages') && !collapsed ? (
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
            <div className={`rounded-lg border border-border bg-white/[0.03] ${collapsed ? 'p-2' : 'p-3'}`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-4 text-cyan-300" />
                {!collapsed ? <span>Agent layer active</span> : null}
              </div>
              {!collapsed ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Sitemap, llms.txt, agent.json, and MCP stay connected.</p>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="min-w-0 pb-16 md:pb-0">
          <header className="nx-nav sticky top-0 z-40 border-b border-border px-4 py-3 backdrop-blur-xl lg:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center justify-between gap-3 xl:hidden">
                <a href="/dashboard" className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md border border-border bg-white text-black"><NexezLogo className="size-5" /></div>
                  <span className="text-sm font-medium">Nexez</span>
                </a>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <a href="/create" className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-3 text-xs font-medium text-black">
                    <Plus className="size-3.5" />
                    New
                  </a>
                  {authed ? (
                    <form action="/auth/signout" method="post">
                      <button
                        type="submit"
                        aria-label="Sign out"
                        className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-white/5 hover:text-white"
                      >
                        <LogOut className="size-4" />
                      </button>
                    </form>
                  ) : (
                    <a
                      href="/login"
                      className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-white hover:bg-white/5"
                    >
                      Sign in
                    </a>
                  )}
                </div>
              </div>
              {authed ? <QuickPageSearch /> : <div className="flex-1" />}
              <div className="hidden items-center gap-2 xl:flex">
                <ThemeToggle />
                <a href="/create" className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-zinc-200">
                  <Plus className="size-4" />
                  New Page
                </a>
                {authed ? (
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      aria-label="Sign out"
                      className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-white/5 hover:text-white"
                    >
                      <LogOut className="size-4" />
                    </button>
                  </form>
                ) : (
                  <a
                    href="/login"
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-white hover:bg-white/5"
                  >
                    Sign in
                  </a>
                )}
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
  collapsed,
  pathname,
}: {
  href: string
  label: string
  icon: typeof Grid2X2
  collapsed: boolean
  pathname: string
}) {
  const active = href === '/dashboard' ? pathname === '/dashboard' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <a
      href={href}
      title={label}
      className={`nav-item flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm ${
        active ? 'active' : ''
      } ${collapsed ? 'md:justify-center md:px-0' : ''}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className={`hidden whitespace-nowrap md:block ${collapsed ? 'md:hidden' : 'md:block'}`}>{label}</span>
    </a>
  )
}

function QuickPageSearch() {
  const router = useRouter()
  const [pages, setPages] = useState<PageHit[]>([])
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

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
    <form onSubmit={handleSubmit} className="relative w-full max-w-2xl">
      <label htmlFor="platform-page-search" className="mb-1 block text-xs font-medium text-muted-foreground">
        Search pages
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <input
          id="platform-page-search"
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
          placeholder="Find a page by name or slug..."
          className="h-10 w-full rounded-md border border-border bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          aria-describedby="platform-page-search-hint"
        />
      </div>
      <p id="platform-page-search-hint" className="mt-1 text-[11px] text-muted-foreground">
        Press Enter to edit the first match.
      </p>
      {showResults ? (
        <div className="absolute left-0 right-0 top-[84px] z-50 overflow-hidden rounded-md border border-border bg-[#111] shadow-2xl">
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
                    href={`/${page.slug}`}
                    onMouseDown={(event) => event.preventDefault()}
                    className="mr-2 shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white"
                  >
                    Public
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground">No matching pages.</div>
          )}
        </div>
      ) : null}
    </form>
  )
}
