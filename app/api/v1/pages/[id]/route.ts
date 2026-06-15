import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../utils/supabase/admin'
import { authenticateApiKey } from '../../../../../lib/server/api-auth'
import { PUBLIC_PAGE_SELECT, getBaseUrl, normalizeSlug } from '../../../../../lib/agent-page'
import { pickWritablePageFields } from '../../../../../lib/api-pages'
import { getOwnerPlanId } from '../../../../../lib/server/plan'
import { getPlanLimits } from '../../../../../lib/billing'

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

  const update = pickWritablePageFields(body)
  if (typeof update.slug === 'string') update.slug = normalizeSlug(update.slug as string)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No writable fields provided.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Plan gate: only when flipping a draft → published (editing an already-published
  // page is unrestricted). Count of currently-published pages vs the plan limit.
  if (update.is_published === true) {
    const { data: current } = await admin
      .from('pages')
      .select('is_published')
      .eq('id', id)
      .eq('owner_id', auth.ownerId)
      .maybeSingle<{ is_published: boolean }>()
    if (current && current.is_published !== true) {
      const limit = getPlanLimits(await getOwnerPlanId(admin, auth.ownerId)).pages
      if (Number.isFinite(limit)) {
        const { count } = await admin
          .from('pages')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', auth.ownerId)
          .eq('is_published', true)
        if ((count ?? 0) >= limit) {
          return NextResponse.json(
            { error: `Your plan allows ${limit} published page${limit === 1 ? '' : 's'}. Upgrade your plan to publish more.` },
            { status: 402 },
          )
        }
      }
    }
  }

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
