import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../utils/supabase/admin'
import { authenticateApiKey } from '../../../../../lib/server/api-auth'
import { PUBLIC_PAGE_SELECT, getBaseUrl, normalizeSlug } from '../../../../../lib/agent-page'

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('id', id)
    .eq('owner_id', auth.ownerId) // tenancy enforced in code (admin bypasses RLS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Page not found.' }, { status: 404 })
  return NextResponse.json({ page: data })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const update = pickWritable(body)
  if (typeof update.slug === 'string') update.slug = normalizeSlug(update.slug as string)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No writable fields provided.' }, { status: 400 })
  }

  const admin = createAdminClient()
  // Scope the update to the owner so a key can never touch another tenant's page.
  const { data, error } = await admin
    .from('pages')
    .update(update)
    .eq('id', id)
    .eq('owner_id', auth.ownerId)
    .select(PUBLIC_PAGE_SELECT)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Page not found.' }, { status: 404 })
  return NextResponse.json({ page: data, url: `${getBaseUrl()}/${(data as unknown as { slug: string }).slug}` })
}
