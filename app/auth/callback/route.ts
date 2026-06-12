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
    const supabase = createClient(cookieStore)
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
