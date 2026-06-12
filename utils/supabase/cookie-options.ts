import type { CookieOptionsWithName } from '@supabase/ssr'

const DEFAULT_SHARED_COOKIE_DOMAIN = '.nexez.ai'

function normalizeHost(host: string | null | undefined): string {
  if (!host) return ''
  return host.split(':')[0]!.trim().toLowerCase()
}

function sharedDomain(): string {
  const configured = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim()
  if (!configured) return DEFAULT_SHARED_COOKIE_DOMAIN
  return configured.startsWith('.') ? configured.toLowerCase() : `.${configured.toLowerCase()}`
}

function isSecureSharedHost(host: string | null | undefined): boolean {
  const normalizedHost = normalizeHost(host)
  if (!normalizedHost) return false

  const root = sharedDomain().replace(/^\./, '')
  return normalizedHost === root || normalizedHost.endsWith(`.${root}`)
}

export function getSupabaseCookieOptions(
  host: string | null | undefined,
): CookieOptionsWithName | undefined {
  if (!isSecureSharedHost(host)) return undefined

  return {
    domain: sharedDomain(),
    path: '/',
    sameSite: 'lax',
    secure: true,
  }
}

export function getBrowserSupabaseCookieOptions(): CookieOptionsWithName | undefined {
  if (typeof window === 'undefined') return undefined
  return getSupabaseCookieOptions(window.location.hostname)
}
