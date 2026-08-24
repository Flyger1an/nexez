'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Rocket,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { NexezLogo } from '../NexezLogo'
import { ThemeToggle } from '../ThemeToggle'
import { appUrl } from '../../lib/site'

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/launch', label: 'Launch Control', icon: Rocket },
  { href: '/admin/support', label: 'Support', icon: Inbox },
  { href: '/admin/growth', label: 'Growth Control', icon: TrendingUp },
  { href: '/admin/audit', label: 'Access & audit', icon: History },
] as const

function isActive(pathname: string, href: string): boolean {
  return href === '/admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminShell({ children, email }: { children: ReactNode; email: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href)) ?? NAV_ITEMS[0]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="min-h-screen md:grid md:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-black/20 md:relative md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
          <div className="flex h-16 items-center justify-between gap-3 border-b border-border px-4">
            <Link href="/admin" className="flex min-w-0 items-center gap-3" aria-label="Nexez Admin overview">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-white text-black">
                <NexezLogo className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">Nexez Admin</span>
                <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted-2)]">Platform operations</span>
              </span>
            </Link>
            <span className="inline-flex size-7 items-center justify-center rounded-full border border-[var(--ready)]/25 bg-[var(--ready)]/10 text-[var(--ready)]" title="Platform admin">
              <ShieldCheck className="size-3.5" />
            </span>
          </div>

          <nav className="flex gap-1 overflow-x-auto p-2 md:block md:space-y-1 md:p-3" aria-label="Admin control panel">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm transition ${
                    active
                      ? 'bg-[var(--signal)]/12 text-[var(--signal)]'
                      : 'text-[var(--fg-muted)] hover:bg-white/[0.05] hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="hidden border-t border-border p-3 md:absolute md:inset-x-0 md:bottom-0 md:block">
            <div className="mb-3 rounded-md border border-border bg-white/[0.025] px-3 py-2">
              <p className="truncate text-xs text-[var(--fg-soft)]">{email}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted-2)]">Production · admin only</p>
            </div>
            <a href={appUrl('/dashboard')} className="flex h-9 items-center gap-2 rounded-md px-3 text-xs text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Back to seller dashboard
            </a>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{current.label}</p>
              <p className="mt-0.5 hidden text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted-2)] sm:block">Separate admin surface · secrets redacted</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden min-h-8 items-center gap-2 rounded-full border border-[var(--ready)]/25 bg-[var(--ready)]/10 px-3 text-[11px] text-[var(--ready)] sm:inline-flex">
                <span className="size-1.5 rounded-full bg-[var(--ready)]" /> Production
              </span>
              <button
                type="button"
                onClick={() => router.refresh()}
                aria-label="Refresh admin data"
                title="Refresh admin data"
                className="inline-flex size-9 items-center justify-center rounded-md border border-border text-[var(--fg-muted)] transition hover:bg-white/[0.06] hover:text-foreground"
              >
                <RefreshCw className="size-4" />
              </button>
              <ThemeToggle />
              <form action="/auth/signout?surface=admin" method="post">
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="inline-flex size-9 items-center justify-center rounded-md border border-border text-[var(--fg-muted)] transition hover:bg-white/[0.06] hover:text-foreground"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}
