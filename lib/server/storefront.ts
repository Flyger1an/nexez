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

/**
 * The storefront handle for a published listing's owner, for the listing→storefront
 * backlink. Service-role (slug → owner → handle, both indexed); null in dev or when the
 * owner has no storefront. Avoids touching the SEV1 pages_public projection.
 */
export async function loadStorefrontHandleForSlug(slug: string): Promise<string | null> {
  const clean = (slug || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return null
  const admin = createAdminClient()
  const { data: page } = await admin
    .from('pages')
    .select('owner_id')
    .eq('slug', clean)
    .maybeSingle<{ owner_id: string | null }>()
  if (!page?.owner_id) return null
  const { data: sf } = await admin
    .from('storefronts')
    .select('handle')
    .eq('owner_id', page.owner_id)
    .maybeSingle<{ handle: string }>()
  return sf?.handle ?? null
}

export type StorefrontSummary = Pick<Storefront, 'handle' | 'display_name' | 'logo_url'> & { listing_count: number }

/**
 * Public storefronts (those with ≥1 published listing) + their listing counts, for the
 * discovery directory. Service-role (storefronts has no anon grant). Two small reads
 * (all storefronts; published-listing owner_ids) joined + counted in memory — fine for a
 * cached directory; returns [] in dev. Sorted by listing count, capped.
 */
export async function loadPublicStorefronts(limit = 60): Promise<StorefrontSummary[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const { data: storefronts } = await admin
    .from('storefronts')
    .select('owner_id, handle, display_name, logo_url')
    .returns<Array<Pick<Storefront, 'owner_id' | 'handle' | 'display_name' | 'logo_url'>>>()
  if (!storefronts?.length) return []
  const { data: pubPages } = await admin
    .from('pages')
    .select('owner_id')
    .eq('is_published', true)
    .returns<Array<{ owner_id: string | null }>>()
  const counts = new Map<string, number>()
  for (const p of pubPages ?? []) {
    if (p.owner_id) counts.set(p.owner_id, (counts.get(p.owner_id) ?? 0) + 1)
  }
  return storefronts
    .map((s) => ({ handle: s.handle, display_name: s.display_name, logo_url: s.logo_url, listing_count: counts.get(s.owner_id) ?? 0 }))
    .filter((s) => s.listing_count > 0)
    .sort((a, b) => b.listing_count - a.listing_count)
    .slice(0, limit)
}
