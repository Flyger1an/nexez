import { NextResponse } from 'next/server'
import { createClient } from '../../../utils/supabase/server'
import { cookies } from 'next/headers'
import { safeNextPath } from '../../../lib/safe-redirect'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  // Guard against open redirect: only allow a same-origin relative path.
  const next = safeNextPath(requestUrl.searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore, requestUrl.host)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      // Expired / already-used confirmation or magic link: don't silently drop the
      // user on a blank login form — bounce to /login with a flag the form surfaces.
      const loginUrl = new URL('/login', requestUrl.origin)
      loginUrl.searchParams.set('error', 'auth_callback')
      if (next && next !== '/') loginUrl.searchParams.set('next', next)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
