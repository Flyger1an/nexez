import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createClient } from '../../../utils/supabase/server'
import { reviewCredential } from '../../../lib/credential-review'
import type { CredentialRecord } from '../../../lib/agent-page'
import { ownerAllows } from '../../../lib/server/plan'
import { resolvePageAccess } from '../../../lib/server/page-access'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'

// Owner-managed, LLM-reviewed credentials for a page. Files live in the private
// `credentials` bucket; the record (with the review verdict) is stored in
// pages.verification_details.docs_provided. Only status 'verified' boosts the
// trust score (see getTrustScore). All actions are authorized for the page OWNER
// OR a non-revoked editor-collaborator (via resolvePageAccess), and then act AS the
// owner (owner's plan + owner's data) using the service-role client.

const BUCKET = 'credentials'
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'])

type AuthedOwner =
  | { error: NextResponse }
  | { admin: any; user: any; access: { pageId: string; ownerId: string }; page: any }

// Authorize the caller as owner-or-editor for `pageId`, then hand back the
// service-role client + the resolved OWNER id + the owner's page row. A
// collaborator's session client cannot read/write the owner's rows under RLS,
// so every owner-scoped read/write below goes through `admin`.
async function getRequestUser() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

async function authedOwner(pageId: string, actingUser?: any): Promise<AuthedOwner> {
  const user = actingUser ?? await getRequestUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  if (!hasSupabaseAdminEnv()) return { error: NextResponse.json({ error: 'unavailable' }, { status: 503 }) }

  const access = await resolvePageAccess({
    pageId,
    userId: user.id,
    userEmail: user.email,
    userEmailConfirmedAt: user.email_confirmed_at,
    requireEditor: true,
  })
  if (!access) return { error: NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 }) }

  const admin = createAdminClient()
  // Ownership already proven by resolvePageAccess - load the trusted page row by id
  // (service-role, no owner_id filter needed since access.pageId is authoritative).
  const { data: page } = await admin
    .from('pages')
    .select('id, owner_id, name, industry, location, verification_details')
    .eq('id', access.pageId)
    .maybeSingle()
  if (!page) return { error: NextResponse.json({ error: 'Page not found, or you do not own it.' }, { status: 403 }) }
  return { admin, user, access, page: page as any }
}

function docsOf(page: any): Array<string | CredentialRecord> {
  const docs = page?.verification_details?.docs_provided
  return Array.isArray(docs) ? docs : []
}

async function saveDocs(admin: any, pageId: string, ownerId: string, page: any, docs: Array<string | CredentialRecord>) {
  const updated = { ...(page.verification_details || {}), docs_provided: docs, last_updated: new Date().toISOString() }
  return admin.from('pages').update({ verification_details: updated }).eq('id', pageId).eq('owner_id', ownerId)
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getRequestUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }
  const pageId = String(form.get('pageId') || '')
  const file = form.get('file')
  if (!pageId || !(file instanceof File)) return NextResponse.json({ error: 'pageId and file are required.' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Upload a PNG/JPEG/WebP image or a PDF.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 8MB).' }, { status: 400 })

  const ctx = await authedOwner(pageId, user)
  if ('error' in ctx) return ctx.error
  const { admin, access, page } = ctx

  const bytes = new Uint8Array(await file.arrayBuffer())
  const id = crypto.randomUUID()
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1] || 'bin'
  // Group the stored file under the OWNER (whose data this is), not the acting
  // collaborator, so the file lives with the page it belongs to.
  const path = `${access.ownerId}/${access.pageId}/${id}.${ext}`

  const up = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) return NextResponse.json({ error: `Upload failed: ${up.error.message}` }, { status: 500 })

  // Plan gate (on the OWNER, not the acting collaborator): LLM credential review is
  // an AI feature (Launch+). Below that the file is still stored + listed, but stays
  // 'pending' (no trust boost) - same fail-safe shape as a failed review, with a
  // reason that nudges the upgrade.
  const aiAllowed = await ownerAllows(admin, access.ownerId, 'aiFeatures')
  // Fail-safe: any review failure → pending (never verified), so the file is
  // stored + listed but does not boost trust until it actually passes review.
  const review = aiAllowed
    ? await reviewCredential({
        name: file.name,
        mime: file.type,
        bytes,
        business: { name: page.name, industry: page.industry, location: page.location },
      })
    : { status: 'pending' as const, verdict: { reason: 'Credential review is an AI feature - upgrade to the Launch plan to get documents reviewed and verified.' } }

  const record: CredentialRecord = {
    id,
    name: file.name,
    status: review.status,
    file_path: path,
    mime: file.type,
    public: false,
    verdict: review.verdict,
    uploaded_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
  }

  const { error } = await saveDocs(admin, access.pageId, access.ownerId, page, [...docsOf(page), record])
  if (error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ credential: record }, { status: 201 })
}

export async function PATCH(request: Request): Promise<NextResponse> {
  let body: { pageId?: string; id?: string; public?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.pageId || !body.id) return NextResponse.json({ error: 'pageId and id are required.' }, { status: 400 })
  const ctx = await authedOwner(body.pageId)
  if ('error' in ctx) return ctx.error
  const { admin, access, page } = ctx

  const docs = docsOf(page).map((d) =>
    typeof d === 'object' && d?.id === body.id ? { ...d, public: Boolean(body.public) } : d,
  )
  const { error } = await saveDocs(admin, access.pageId, access.ownerId, page, docs)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const pageId = url.searchParams.get('pageId') || ''
  const id = url.searchParams.get('id') || ''
  if (!pageId || !id) return NextResponse.json({ error: 'pageId and id are required.' }, { status: 400 })
  const ctx = await authedOwner(pageId)
  if ('error' in ctx) return ctx.error
  const { admin, access, page } = ctx

  const target = docsOf(page).find((d) => typeof d === 'object' && d?.id === id) as CredentialRecord | undefined
  const remaining = docsOf(page).filter((d) => !(typeof d === 'object' && d?.id === id))
  const { error } = await saveDocs(admin, access.pageId, access.ownerId, page, remaining)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (target?.file_path) await admin.storage.from(BUCKET).remove([target.file_path]).catch(() => {})
  return NextResponse.json({ ok: true })
}
