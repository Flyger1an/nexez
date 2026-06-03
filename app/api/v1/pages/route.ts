import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { authenticateApiKey } from '../../../../lib/server/api-auth'
import { PUBLIC_PAGE_SELECT, getBaseUrl, normalizeSlug } from '../../../../lib/agent-page'

// Fields a client may set via the API (everything else is ignored).
const WRITABLE = [
  'name',
  'description',
  'website_url',
  'cta_url',
  'cta_label',
  'audience',
  'location',
  'contact_email',
  'industry',
  'prefer_original_site',
  'products',
  'services',
  'faqs',
  'is_published',
  'custom_domain',
  'domain_path',
] as const

function pickWritable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of WRITABLE) {
    if (body[key] !== undefined) out[key] = body[key]
  }
  return out
}

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
    ...pickWritable(body),
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
