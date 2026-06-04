import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

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
  const isProtected = path === '/dashboard' || path.startsWith('/dashboard/')

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', path + (request.nextUrl.search || ''))
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

