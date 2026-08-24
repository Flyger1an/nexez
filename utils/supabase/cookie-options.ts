import type { CookieOptionsWithName } from '@supabase/ssr'

const DEFAULT_SHARED_COOKIE_DOMAIN = '.nexez.ai'
export const ADMIN_AUTH_COOKIE_NAME = 'nexez-admin-auth-token'

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

function isAdminHost(host: string | null | undefined): boolean {
  const normalizedHost = normalizeHost(host)
  const configured = normalizeHost(process.env.NEXT_PUBLIC_ADMIN_URL?.replace(/^https?:\/\//, '').split('/')[0])
  return normalizedHost === (configured || 'admin.nexez.ai') || normalizedHost === 'admin.localhost'
}

export function getSupabaseCookieOptions(
  host: string | null | undefined,
): CookieOptionsWithName | undefined {
  if (isAdminHost(host)) {
    return {
      name: ADMIN_AUTH_COOKIE_NAME,
      path: '/',
      sameSite: 'lax',
      secure: normalizeHost(host) !== 'admin.localhost',
    }
  }
  if (!isSecureSharedHost(host)) return undefined

  return {
    domain: sharedDomain(),
    path: '/',
    sameSite: 'lax',
    secure: true,
  }
}

export function isSupabaseAuthCookieForHost(name: string, host: string | null | undefined): boolean {
  const configuredName = getSupabaseCookieOptions(host)?.name
  if (configuredName) return name === configuredName || name.startsWith(`${configuredName}.`)
  return /^sb-.*-auth-token(?:\.\d+)?$/.test(name)
}

export function getBrowserSupabaseCookieOptions(): CookieOptionsWithName | undefined {
  if (typeof window === 'undefined') return undefined
  return getSupabaseCookieOptions(window.location.hostname)
}
