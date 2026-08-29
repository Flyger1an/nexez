'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image, { type ImageLoaderProps } from 'next/image'
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  CreditCard,
  GraduationCap,
  Home,
  LogIn,
  LogOut,
  MessageCircleMore,
  MoreHorizontal,
  Settings,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { THEME_OPTIONS, useThemeChoice } from './ThemeToggle'
import type { ThemeChoice } from '../lib/theme'

export type PlatformViewer = {
  displayName: string
  email: string
  logoUrl?: string | null
}

type UtilityLink = {
  href: string
  label: string
  icon: typeof Home
  signedInOnly?: boolean
}

export const ACCOUNT_PRIMARY_LINKS: UtilityLink[] = [
  { href: '/', label: 'Home Page', icon: Home },
  { href: '/dashboard/billing', label: 'Billing & plan', icon: CreditCard, signedInOnly: true },
]

export const ACCOUNT_RESOURCE_LINKS: UtilityLink[] = [
  { href: '/docs', label: 'Documentation', icon: BookOpen },
  { href: '/learn', label: 'Learn', icon: GraduationCap },
  { href: '/support', label: 'Help & support', icon: CircleHelp },
  {
    href: '/support?category=general&subject=Product%20feedback',
    label: 'Send feedback',
    icon: MessageCircleMore,
  },
]

const itemClass =
  'group flex min-h-8 w-full select-none items-center gap-2.5 rounded-lg px-2.5 py-1 text-sm font-medium text-foreground outline-none transition-colors data-[highlighted]:bg-[var(--fill-2)] data-[highlighted]:text-foreground'

function accountInitial(viewer: PlatformViewer | null) {
  const source = viewer?.displayName.trim() || viewer?.email.trim() || 'Nexez'
  return source.slice(0, 1).toUpperCase()
}

function storefrontLogoLoader({ src }: ImageLoaderProps) {
  return src
}

export function PlatformAccountAvatar({
  viewer,
  loading = false,
  size = 'small',
}: {
  viewer: PlatformViewer | null
  loading?: boolean
  size?: 'small' | 'large'
}) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null)
  const dimension = size === 'large' ? 36 : 32
  const sizeClass = size === 'large' ? 'size-9 text-sm' : 'size-8 text-sm'
  const logoUrl = viewer?.logoUrl && viewer.logoUrl !== failedLogoUrl ? viewer.logoUrl : null

  return (
    <span
      className={`relative flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--signal)]/45 bg-[var(--signal)]/10 font-semibold text-[var(--signal)]`}
    >
      {logoUrl ? (
        <Image
          loader={storefrontLogoLoader}
          src={logoUrl}
          alt=""
          width={dimension}
          height={dimension}
          sizes={`${dimension}px`}
          unoptimized
          className="size-full object-cover"
          onError={() => setFailedLogoUrl(logoUrl)}
        />
      ) : loading ? (
        <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
      ) : (
        accountInitial(viewer)
      )}
    </span>
  )
}

function visibleLinks(links: UtilityLink[], signedIn: boolean) {
  return links.filter((link) => !link.signedInOnly || signedIn)
}

export function PlatformAccountMenu({
  authState,
  viewer,
  pinned,
}: {
  authState: 'loading' | 'signed-in' | 'signed-out'
  viewer: PlatformViewer | null
  pinned: boolean
}) {
  const signedIn = authState === 'signed-in'
  const accountName = signedIn ? viewer?.displayName || 'Nexez account' : 'Nexez'
  const accountDetail = authState === 'loading'
    ? 'Loading account'
    : signedIn
      ? viewer?.email || 'Signed in'
      : 'Sign in for your workspace'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-[var(--fill-1)] p-2 text-left outline-none transition-colors hover:bg-[var(--fill-2)] focus-visible:ring-2 focus-visible:ring-[var(--signal)]/60"
          aria-label="Open account menu"
        >
          <PlatformAccountAvatar viewer={viewer} loading={authState === 'loading'} />
          <span
            className={`min-w-0 flex-1 transition-opacity duration-150 ${
              pinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'
            }`}
          >
            <span className="block truncate text-sm font-medium text-foreground">{accountName}</span>
            <span className="block truncate text-xs text-muted-foreground">{accountDetail}</span>
          </span>
          <MoreHorizontal
            className={`size-4 shrink-0 text-muted-foreground transition-opacity duration-150 ${
              pinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'
            }`}
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className="z-[100] w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-[var(--bg-2)] p-1.5 text-foreground shadow-2xl shadow-black/35 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
          aria-label="Account and workspace"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-1">
            <PlatformAccountAvatar viewer={viewer} loading={authState === 'loading'} size="large" />
            <DropdownMenu.Label className="min-w-0 flex-1 py-0.5">
              <span className="block truncate text-sm font-semibold text-foreground">{accountName}</span>
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{accountDetail}</span>
            </DropdownMenu.Label>
            {signedIn ? (
              <DropdownMenu.Item asChild>
                <Link
                  href="/dashboard/settings#workspace"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-[var(--fill-2)] hover:text-foreground focus:bg-[var(--fill-2)] focus:text-foreground"
                  aria-label="Open platform settings"
                >
                  <Settings className="size-4" aria-hidden="true" />
                </Link>
              </DropdownMenu.Item>
            ) : null}
          </div>

          <DropdownMenu.Separator className="my-px h-px bg-border" />

          {visibleLinks(ACCOUNT_PRIMARY_LINKS, signedIn).map((link) => (
            <AccountMenuLink key={link.href} link={link} />
          ))}

          <ThemeMenuRow />

          <DropdownMenu.Separator className="my-px h-px bg-border" />

          {ACCOUNT_RESOURCE_LINKS.map((link) => (
            <AccountMenuLink key={link.href} link={link} />
          ))}

          <DropdownMenu.Separator className="my-px h-px bg-border" />

          {signedIn ? (
            <form action="/auth/signout" method="post">
              <DropdownMenu.Item asChild>
                <button type="submit" className={itemClass}>
                  <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 text-left">Sign out</span>
                </button>
              </DropdownMenu.Item>
            </form>
          ) : (
            <DropdownMenu.Item asChild>
              <Link href="/login" className={itemClass}>
                <LogIn className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">Sign in</span>
                <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="my-px h-px bg-border" />

          <DropdownMenu.Item asChild>
            <Link
              href={signedIn ? '/dashboard/settings#agent-surfaces' : '/docs'}
              className={`${itemClass} text-[var(--signal)]`}
            >
              <span className="relative flex size-4 items-center justify-center" aria-hidden="true">
                <Sparkles className="size-4" />
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--ready)] ring-2 ring-[var(--bg-2)]" />
              </span>
              <span className="flex-1">Agent layer active</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function AccountMenuLink({ link }: { link: UtilityLink }) {
  const Icon = link.icon
  return (
    <DropdownMenu.Item asChild>
      <Link href={link.href} className={itemClass}>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">{link.label}</span>
        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-data-[highlighted]:opacity-100" aria-hidden="true" />
      </Link>
    </DropdownMenu.Item>
  )
}

function ThemeMenuRow() {
  const { choice, pick } = useThemeChoice()

  return (
    <div className="flex min-h-8 items-center gap-2.5 rounded-lg px-2.5 py-0.5 text-sm font-medium text-foreground">
      <span className="flex-1">Theme</span>
      <DropdownMenu.RadioGroup value={choice} onValueChange={(value) => pick(value as ThemeChoice)}>
        <span className="inline-flex items-center rounded-lg border border-border bg-[var(--fill-1)] p-0.5">
          {THEME_OPTIONS.map(({ id, Icon, label }) => (
            <DropdownMenu.RadioItem
              key={id}
              value={id}
              onSelect={(event) => event.preventDefault()}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors data-[highlighted]:text-foreground data-[state=checked]:bg-[var(--fill-2)] data-[state=checked]:text-foreground"
              aria-label={`${label} theme`}
              title={`${label} theme`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </DropdownMenu.RadioItem>
          ))}
        </span>
      </DropdownMenu.RadioGroup>
    </div>
  )
}
