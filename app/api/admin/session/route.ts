import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isPlatformAdmin } from '../../../../lib/server/plan'
import { createClient } from '../../../../utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const supabase = createClient(await cookies(), requestUrl.host)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await isPlatformAdmin(supabase, user.id))) {
    await supabase.auth.signOut()
    return NextResponse.json({ error: 'This account does not have platform-admin access.' }, { status: 403 })
  }

  return NextResponse.json({ ok: true, email: user.email ?? null })
}
