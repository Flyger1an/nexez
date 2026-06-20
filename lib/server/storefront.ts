import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { AgentPage, PUBLIC_PAGE_SELECT } from '../agent-page'
import type { Storefront } from '../storefront'

/**
 * Resolve a public storefront + its published listings by handle. Reads via the
 * SERVICE-ROLE client because `storefronts` has no anon grant (least privilege —
 * mirrors how the buyer portal + [slug]/agent.json read owner-scoped data on the
 * agent runtime). Listings come from the rules-stripping `pages_public` projection.
 * Returns null when the handle is unknown or the service-role env is unavailable
 * (e.g. local dev), so callers 404.
 */
export async function loadStorefrontByHandle(
  handle: string,
): Promise<{ storefront: Storefront; listings: AgentPage[] } | null> {
  const clean = (handle || '').trim().toLowerCase()
  if (!clean || !hasSupabaseAdminEnv()) return null

  const admin = createAdminClient()
  const { data: storefront } = await admin
    .from('storefronts')
    .select('id, owner_id, handle, display_name, description, logo_url, accent_color')
    .eq('handle', clean)
    .maybeSingle<Storefront>()
  if (!storefront) return null

  // Read the owner's published listings from the BASE pages table via the service-role
  // client: pages_public (the anon projection) deliberately no longer exposes owner_id
  // (launch-hardening), so it can't be filtered by owner. The base rows carry private
  // offer `rules`; callers MUST only surface the curated fields (name/slug/description/
  // location + the offer_count/readiness DERIVED server-side) — never serialize the raw
  // products/services. Mirrors how checkout reads base pages via service-role.
  const { data: listings } = await admin
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('owner_id', storefront.owner_id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  return { storefront, listings: listings ?? [] }
}
