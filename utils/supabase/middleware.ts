import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { resolveAuthGate } from './auth-gate'
import { getSupabaseCookieOptions } from './cookie-options'

const STALE_SESSION_ERROR_CODES = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
])

export function isStaleSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const authError = error as { code?: unknown; message?: unknown }
  if (typeof authError.code === 'string' && STALE_SESSION_ERROR_CODES.has(authError.code)) return true
  if (typeof authError.message !== 'string') return false
  return /invalid refresh token|refresh token not found|refresh token.*already used/i.test(authError.message)
}

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
  cookieOptions: ReturnType<typeof getSupabaseCookieOptions>,
) {
  for (const cookie of request.cookies.getAll()) {
    if (!/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)) continue
    request.cookies.set(cookie.name, '')
    response.cookies.set(cookie.name, '', {
      ...(cookieOptions ?? {}),
      path: '/',
      expires: new Date(0),
      maxAge: 0,
    })
  }
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })
  const cookieOptions = getSupabaseCookieOptions(request.headers.get('host'))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      ...(cookieOptions ? { cookieOptions } : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const { data, error } = await supabase.auth.getUser()
  const user = data.user

  // A rotated, revoked, or already-consumed refresh token is an expected stale
  // browser state, not an application failure. Remove every auth-token chunk so
  // the next request does not retry the same token forever, then continue through
  // the ordinary anonymous gate. Other auth/network failures still fail closed
  // without destroying a session that may recover on the next request.
  const hasStaleSession = isStaleSessionError(error)

  // Server-side auth gate: the dashboard (and all its sub-routes) require an
  // account. Unauthenticated visitors are redirected to sign in — no flash, no
  // access to the dashboard menu. Public surfaces (/, /create, /marketplace,
  // /directory, /leaderboard, /simulator, /support, public pages) stay open.
  const path = request.nextUrl.pathname
  const gate = resolveAuthGate(path, request.nextUrl.search, Boolean(user))

  if (gate) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', gate.next)
    const response = NextResponse.redirect(loginUrl)
    if (hasStaleSession) clearSupabaseAuthCookies(request, response, cookieOptions)
    return response
  }

  if (hasStaleSession) clearSupabaseAuthCookies(request, supabaseResponse, cookieOptions)
  return supabaseResponse
}
