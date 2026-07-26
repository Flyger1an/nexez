import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { createClient } from '../../../../../utils/supabase/server'

export async function PATCH(request: Request) {
  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Promotion settings are unavailable.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { pageId?: string }
  const pageId = String(body.pageId || '')
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(pageId)) {
    return NextResponse.json({ error: 'Choose a valid published listing.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const [{ data: page }, { data: grant }] = await Promise.all([
    admin
      .from('pages')
      .select('id')
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .eq('is_published', true)
      .maybeSingle<{ id: string }>(),
    admin
      .from('promotional_plan_grants')
      .select('id')
      .eq('owner_id', user.id)
      .eq('status', 'active')
      .lte('starts_at', now)
      .gt('ends_at', now)
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>(),
  ])

  if (!page) {
    return NextResponse.json({ error: 'Choose one of your published listings.' }, { status: 404 })
  }
  if (!grant) {
    return NextResponse.json({ error: 'No active promotion needs a fallback listing.' }, { status: 409 })
  }

  const { data: updated, error } = await admin
    .from('promotional_plan_grants')
    .update({ fallback_page_id: page.id })
    .eq('id', grant.id)
    .eq('owner_id', user.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()
  if (error || !updated) {
    return NextResponse.json({ error: 'Could not save the fallback listing.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, fallbackPageId: page.id })
}
