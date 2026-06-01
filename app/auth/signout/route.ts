import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  await supabase.auth.signOut()

  return NextResponse.redirect(new URL('/', request.url), {
    status: 303,
  })
}

