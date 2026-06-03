import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { authenticateApiKey } from '../../../../lib/server/api-auth'
import { PUBLIC_PAGE_SELECT, getBaseUrl, normalizeSlug } from '../../../../lib/agent-page'
import { pickWritablePageFields } from '../../../../lib/api-pages'
import { enforceRateLimit } from '../../../../lib/rate-limit'

async function uniqueSlug(admin: ReturnType<typeof createAdminClient>, base: string): Promise<string> {
  const root = normalizeSlug(base) || 'page'
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`
    const { data } = await admin.from('pages').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }
  return `${root}-${Date.now().toString(36)}`
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, 'v1-pages', 60, 60_000)
  if (limited) return limited
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('owner_id', auth.ownerId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pages: data ?? [] })
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'v1-pages-write', 30, 60_000)
  if (limited) return limited
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required.' }, { status: 400 })

  const admin = createAdminClient()
  const slug = await uniqueSlug(admin, typeof body.slug === 'string' && body.slug ? (body.slug as string) : name)

  const insert = {
    ...pickWritablePageFields(body),
    name,
    slug,
    owner_id: auth.ownerId,
    is_published: body.is_published === true, // explicit opt-in; default draft
  }

  const { data, error } = await admin.from('pages').insert(insert).select(PUBLIC_PAGE_SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(
    { page: data, url: `${getBaseUrl()}/${slug}` },
    { status: 201 },
  )
}
