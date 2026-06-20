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

  const { data: listings } = await admin
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('owner_id', storefront.owner_id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  return { storefront, listings: listings ?? [] }
}
