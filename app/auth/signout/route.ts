import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'
import { adminUrl, isAdminHost, marketingUrl } from '../../../lib/site'

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore, requestUrl.host)
  await supabase.auth.signOut()

  const adminSurface = isAdminHost(requestUrl.host) || requestUrl.searchParams.get('surface') === 'admin'

  // signOut() clears the shared session cookie on domain=.nexez.ai (host passed to
  // createClient above), removing it across nexez.ai + app.nexez.ai.
  return NextResponse.redirect(adminSurface ? adminUrl('/login') : marketingUrl('/'), {
    status: 303,
  })
}
