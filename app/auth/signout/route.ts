import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'
import { marketingUrl } from '../../../lib/site'

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore, requestUrl.host)
  await supabase.auth.signOut()

  const response = NextResponse.redirect(marketingUrl('/'), {
    status: 303,
  })
  // Clear the old auth hint used before nexez.ai/app.nexez.ai shared cookies.
  response.cookies.set('nx_authed', '', {
    sameSite: 'none',
    secure: true,
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
  return response
}
