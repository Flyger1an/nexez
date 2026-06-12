import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  await supabase.auth.signOut()

  const response = NextResponse.redirect(new URL('/', request.url), {
    status: 303,
  })
  // Clear the cross-domain auth hint immediately so the marketing nav stops
  // showing "Dashboard" the moment the user signs out.
  response.cookies.set('nx_authed', '', {
    sameSite: 'none',
    secure: true,
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
  return response
}

