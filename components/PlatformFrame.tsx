'use client'

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gauge,
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

type PageHit = {
  id: string
  name: string
  slug: string
  is_published: boolean
}

const platformPrefixes = ['/dashboard', '/create', '/simulator', '/marketplace', '/directory', '/leaderboard', '/support']

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: Grid2X2, mobile: true },
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

export function PlatformFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const shouldFrame = useMemo(() => {
    return platformPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  }, [pathname])

  useEffect(() => {
    const stored = window.localStorage.getItem('nexez-sidebar-collapsed')
    if (stored) setCollapsed(stored === 'true')
  }, [])

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem('nexez-sidebar-collapsed', String(next))
      return next
    })
  }

  if (!shouldFrame) return <>{children}</>

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className={`grid min-h-screen transition-[grid-template-columns] duration-200 ${
          collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[248px_minmax(0,1fr)]'
        }`}
      >
        <aside className="dashboard-sidebar fixed inset-x-0 bottom-0 z-50 border-t lg:sticky lg:top-0 lg:inset-x-auto lg:bottom-auto lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-t-0">
          <div className="hidden items-center gap-3 border-b border-border px-4 py-4 lg:flex">
            <a href="/" className="flex min-w-0 flex-1 items-center gap-3" title="Nexez home">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white text-sm font-semibold text-black">
                N
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

          <nav className="grid grid-cols-5 gap-1 px-2 py-2 lg:block lg:space-y-1 lg:p-3">
            {navItems.map((item) => (
              <ShellNavItem key={item.href} {...item} collapsed={collapsed} pathname={pathname} />
            ))}
          </nav>

          <div className="mt-auto hidden p-3 lg:block">
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

        <div className="min-w-0 pb-16 lg:pb-0">
          <header className="sticky top-0 z-40 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl lg:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center justify-between gap-3 xl:hidden">
                <a href="/" className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md border border-border bg-white text-xs font-semibold text-black">N</div>
                  <span className="text-sm font-medium">Nexez</span>
                </a>
                <a href="/create" className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-3 text-xs font-medium text-black">
                  <Plus className="size-3.5" />
                  New
                </a>
              </div>
              <QuickPageSearch />
              <div className="hidden items-center gap-2 xl:flex">
                <a href="/create" className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-zinc-200">
                  <Plus className="size-4" />
                  New Page
                </a>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    aria-label="Sign out"
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-white/5 hover:text-white"
                  >
                    <LogOut className="size-4" />
                  </button>
                </form>
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
  mobile,
  collapsed,
  pathname,
}: {
  href: string
  label: string
  icon: typeof Grid2X2
  mobile?: boolean
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
      } ${mobile ? '' : 'hidden lg:flex'} ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className={`hidden whitespace-nowrap lg:block ${collapsed ? 'lg:hidden' : 'lg:block'}`}>{label}</span>
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
        .limit(25)
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
          placeholder="Find a page by name or slug..."
          className="h-10 w-full rounded-md border border-border bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        />
      </div>
      {focused && pages.length > 0 ? (
        <div className="absolute left-0 right-0 top-[66px] z-50 overflow-hidden rounded-md border border-border bg-[#111] shadow-2xl">
          {hits.length ? (
            hits.map((page) => (
              <button
                key={page.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openPage(page)}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-white/[0.06]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-white">{page.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">/{page.slug}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${page.is_published ? 'badge-published' : 'badge-draft'}`}>
                  {page.is_published ? 'Live' : 'Draft'}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground">No matching pages.</div>
          )}
        </div>
      ) : null}
    </form>
  )
}
