import 'server-only'

import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import type { PublicIdentifierNamespace } from '../public-identifier'

export type IdentifierAvailability = {
  available: boolean
  reason: string
}

export async function getPublicIdentifierAvailability(input: {
  namespace: PublicIdentifierNamespace
  identifier: string
  ownerId: string
  subjectId?: string | null
}): Promise<IdentifierAvailability> {
  const { data, error } = await createAdminClient().rpc('nz_public_identifier_availability', {
    p_namespace: input.namespace,
    p_identifier: input.identifier,
    p_owner_id: input.ownerId,
    p_subject_id: input.subjectId ?? null,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return {
    available: Boolean((row as { available?: unknown } | null)?.available),
    reason: String((row as { reason?: unknown } | null)?.reason ?? 'unavailable'),
  }
}

export async function resolveRenamedPageSlug(slug: string): Promise<string | null> {
  if (!hasSupabaseAdminEnv()) return null
  const { data, error } = await createAdminClient().rpc('nz_resolve_page_slug_alias', {
    p_slug: slug,
  })
  if (error || typeof data !== 'string' || !data) return null
  return data
}

export async function renamedPageArtifactRedirect(
  request: Request,
  slug: string,
): Promise<Response | null> {
  const currentSlug = await resolveRenamedPageSlug(slug)
  if (!currentSlug) return null
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  if (segments[1] !== slug) return null
  segments[1] = currentSlug
  url.pathname = segments.join('/')
  return Response.redirect(url, 308)
}
