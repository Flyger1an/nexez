import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { resolveAuthGate } from './auth-gate'

// Non-sensitive auth HINT cookie. The real session cookie is SameSite=Lax and
// host-only, so the cross-domain marketing site (nexez.ai) can never read it. This
// boolean is SameSite=None so a credentialed ping from nexez.ai can detect "this
// browser has a nexez.app session" and flip the nav label — it carries NO session
// data and is NEVER used for authorization (the session cookie remains the only
// credential). Written only when the value changes, to avoid Set-Cookie on every
// response (which would defeat caching of public pages).
const AUTHED_HINT_COOKIE = 'nx_authed'
const AUTHED_HINT_MAX_AGE = 60 * 60 * 24 * 7 // 7 days; re-set whenever it changes

function syncAuthedHint(request: NextRequest, response: NextResponse, authed: boolean) {
  const present = request.cookies.get(AUTHED_HINT_COOKIE)?.value === '1'
  if (authed && !present) {
    response.cookies.set(AUTHED_HINT_COOKIE, '1', {
      sameSite: 'none',
      secure: true,
      httpOnly: true,
      path: '/',
      maxAge: AUTHED_HINT_MAX_AGE,
    })
  } else if (!authed && present) {
    response.cookies.set(AUTHED_HINT_COOKIE, '', {
      sameSite: 'none',
      secure: true,
      httpOnly: true,
      path: '/',
      maxAge: 0,
    })
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
    const redirectResponse = NextResponse.redirect(loginUrl)
    syncAuthedHint(request, redirectResponse, false)
    return redirectResponse
  }

  syncAuthedHint(request, supabaseResponse, Boolean(user))
  return supabaseResponse
}

