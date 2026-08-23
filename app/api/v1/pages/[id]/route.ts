import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../utils/supabase/admin'
import { authenticateApiKey } from '../../../../../lib/server/api-auth'
import { SERVER_PAGE_SELECT, getBaseUrl, normalizeSlug } from '../../../../../lib/agent-page'
import { isPageLimitError, pickWritablePageFields, wantsCustomDomain } from '../../../../../lib/api-pages'
import { ownerAllows } from '../../../../../lib/server/plan'
import {
  entitlementAllocationRetryBody,
  entitlementAllocationRetryInit,
  isEntitlementAllocationRetry,
} from '../../../../../lib/entitlement-allocation-error'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pages')
    .select(SERVER_PAGE_SELECT)
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

  // Plan gate: attaching a custom domain is a Launch+ (`customDomain`) capability.
  // Clearing it stays open so a downgraded owner can still detach.
  if (wantsCustomDomain(update) && !(await ownerAllows(admin, auth.ownerId, 'customDomain'))) {
    return NextResponse.json(
      { error: 'Custom domains are available on the Launch plan and up. Upgrade to attach a domain.' },
      { status: 402 },
    )
  }

  // The exact canonical published-page limit is enforced by a DB trigger on the
  // draft → published transition, so we attempt the update and map its
  // check_violation to a 402.
  // Scope the update to the owner so a key can never touch another tenant's page.
  const { data, error } = await admin
    .from('pages')
    .update(update)
    .eq('id', id)
    .eq('owner_id', auth.ownerId)
    .select(SERVER_PAGE_SELECT)
    .maybeSingle()

  if (error) {
    if (isEntitlementAllocationRetry(error)) {
      return NextResponse.json(entitlementAllocationRetryBody, entitlementAllocationRetryInit)
    }
    if (isPageLimitError(error)) {
      return NextResponse.json(
        { error: `${error.message} Upgrade your plan to publish more.` },
        { status: 402 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Page not found.' }, { status: 404 })
  return NextResponse.json({ page: data, url: `${getBaseUrl()}/${(data as unknown as { slug: string }).slug}` })
}
