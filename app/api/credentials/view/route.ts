import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import type { CredentialRecord } from '../../../../lib/agent-page'
import { credentialPathBelongsToPage } from '../../../../lib/credential-path'

// Public viewer for credential documents the owner has explicitly marked public.
// Only serves a file when its record is public === true AND status === 'verified'
// on a published page. Returns a short-lived signed URL (redirect) so the private
// bucket stays private and links can't be shared indefinitely.
export async function GET(request: Request) {
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  const url = new URL(request.url)
  const slug = url.searchParams.get('slug') || ''
  const id = url.searchParams.get('id') || ''
  if (!slug || !id) return NextResponse.json({ error: 'slug and id are required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: page } = await admin
    .from('pages')
    .select('id, owner_id, verification_details, is_published')
    .eq('slug', slug)
    .maybeSingle()

  if (!page || (page as any).is_published !== true) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const docs = (page as any).verification_details?.docs_provided
  const rec = Array.isArray(docs)
    ? (docs.find((d: unknown) => d && typeof d === 'object' && (d as CredentialRecord).id === id) as CredentialRecord | undefined)
    : undefined

  if (!rec || rec.public !== true || rec.status !== 'verified' || !rec.file_path
    || !credentialPathBelongsToPage(rec, page.owner_id, page.id)) {
    return NextResponse.json({ error: 'This document is not publicly available.' }, { status: 404 })
  }

  const { data: signed, error } = await admin.storage.from('credentials').createSignedUrl(rec.file_path, 600)
  if (error || !signed?.signedUrl) return NextResponse.json({ error: 'Could not generate a link.' }, { status: 500 })
  const response = NextResponse.redirect(signed.signedUrl)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
