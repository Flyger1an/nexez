import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { AgentPage, PUBLIC_PAGE_SELECT } from '../agent-page'
import { planAllows } from '../billing'
import type { Storefront, StorefrontWithCount } from '../storefront'
import { getOwnerBillingState, getOwnerPlanIds } from './plan'

/**
 * Resolve a public storefront + its published listings by handle. Reads via the
 * SERVICE-ROLE client because `storefronts` has no anon grant (least privilege -
 * mirrors how the buyer portal + [slug]/agent.json read owner-scoped data on the
 * agent runtime). Listings are scoped to THIS storefront via `storefront_id` (Phase 4:
 * an account can own several storefronts, so owner_id is no longer 1:1 with a storefront).
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
    .is('plan_suspended_at', null)
    .maybeSingle<Storefront>()
  if (!storefront) return null

  // Compatibility hook for an explicit operational suspension. Billing expiry
  // falls back to Free, so ordinary lifecycle changes do not enter this branch.
  // Read THIS storefront's published listings from the BASE pages table via the
  // service-role client: pages_public (the anon projection) deliberately exposes neither
  // owner_id nor storefront_id (launch-hardening / SEV1 parity), so it can't be filtered
  // here. The base rows carry private offer `rules`; callers MUST only surface the curated
  // fields (name/slug/description/location + the offer_count/readiness DERIVED server-side)
  // - never serialize the raw products/services. Mirrors how checkout reads base pages.
  const [billing, { data: listings }] = await Promise.all([
    getOwnerBillingState(admin, storefront.owner_id),
    admin
      .from('pages')
      .select(PUBLIC_PAGE_SELECT)
      .eq('storefront_id', storefront.id)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .returns<AgentPage[]>(),
  ])
  const publicStorefront = planAllows(billing.planId, 'whiteLabel')
    ? storefront
    : { ...storefront, logo_url: null, accent_color: null }
  if (billing.isPaused) return { storefront: publicStorefront, listings: [] }

  return { storefront: publicStorefront, listings: listings ?? [] }
}

/**
 * The storefront handle for a published listing, for the listing→storefront backlink.
 * Resolves via the listing's own `storefront_id` (so the backlink points at the listing's
 * actual storefront, not just the account's first one), falling back to the owner's
 * primary storefront if a legacy row has no storefront_id. Service-role; null in dev or
 * when there's no storefront. Avoids touching the SEV1 pages_public projection.
 */
export async function loadStorefrontHandleForSlug(slug: string): Promise<string | null> {
  const clean = (slug || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return null
  const admin = createAdminClient()
  const { data: page } = await admin
    .from('pages')
    .select('owner_id, storefront_id')
    .eq('slug', clean)
    .maybeSingle<{ owner_id: string | null; storefront_id: string | null }>()
  if (!page) return null

  if (page.storefront_id) {
    const { data: sf } = await admin
      .from('storefronts')
      .select('handle')
      .eq('id', page.storefront_id)
      .is('plan_suspended_at', null)
      .maybeSingle<{ handle: string }>()
    if (sf?.handle) return sf.handle
  }
  if (!page.owner_id) return null
  const { data: primary } = await admin
    .from('storefronts')
    .select('handle')
    .eq('owner_id', page.owner_id)
    .is('plan_suspended_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ handle: string }>()
  return primary?.handle ?? null
}

/**
 * Batched listing slug → storefront handle resolver for global agent surfaces.
 * Keeps `/agent-pages.json` from doing one service-role lookup per listing while
 * still avoiding owner_id exposure from the public projection.
 */
export async function loadStorefrontHandlesForSlugs(slugs: string[]): Promise<Map<string, string>> {
  const clean = Array.from(new Set(slugs.map((slug) => (slug || '').trim()).filter(Boolean)))
  const result = new Map<string, string>()
  if (!clean.length || !hasSupabaseAdminEnv()) return result

  const admin = createAdminClient()
  const pages: Array<{ slug: string; owner_id: string | null; storefront_id: string | null }> = []
  for (const batch of valueBatches(clean)) {
    const { data } = await admin
      .from('pages')
      .select('slug, owner_id, storefront_id')
      .in('slug', batch)
      .eq('is_published', true)
      .returns<Array<{ slug: string; owner_id: string | null; storefront_id: string | null }>>()
    pages.push(...(data ?? []))
  }

  const ownerIds = Array.from(new Set(pages.map((page) => page.owner_id).filter(Boolean))) as string[]
  if (!ownerIds.length) return result

  const storefronts: Array<{ id: string; owner_id: string; handle: string }> = []
  for (const batch of valueBatches(ownerIds)) {
    const { data } = await admin
      .from('storefronts')
      .select('id, owner_id, handle')
      .in('owner_id', batch)
      .is('plan_suspended_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .returns<Array<{ id: string; owner_id: string; handle: string }>>()
    storefronts.push(...(data ?? []))
  }

  const handleByStorefront = new Map(storefronts.map((storefront) => [storefront.id, storefront.handle]))
  const primaryHandleByOwner = new Map<string, string>()
  for (const storefront of storefronts) {
    if (!primaryHandleByOwner.has(storefront.owner_id)) {
      primaryHandleByOwner.set(storefront.owner_id, storefront.handle)
    }
  }
  for (const page of pages) {
    if (!page.owner_id) continue
    const handle = (page.storefront_id && handleByStorefront.get(page.storefront_id))
      || primaryHandleByOwner.get(page.owner_id)
    if (handle) result.set(page.slug, handle)
  }

  return result
}

function valueBatches<T>(values: T[], size = 200): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size))
  return batches
}

export type StorefrontSummary = Pick<Storefront, 'handle' | 'display_name' | 'logo_url'> & { listing_count: number }

/**
 * Public storefronts (those with ≥1 published listing) + their listing counts, for the
 * discovery directory. Service-role (storefronts has no anon grant). Two small reads (all
 * storefronts; published-listing storefront_ids) joined + counted in memory - fine for a
 * cached directory; returns [] in dev. Counts are keyed by storefront_id so a multi-
 * storefront account splits its listings across its storefronts. Sorted by count, capped.
 */
export async function loadPublicStorefronts(limit = 60): Promise<StorefrontSummary[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const { data: storefronts } = await admin
    .from('storefronts')
    .select('id, owner_id, handle, display_name, logo_url')
    .is('plan_suspended_at', null)
    .returns<Array<Pick<Storefront, 'id' | 'owner_id' | 'handle' | 'display_name' | 'logo_url'>>>()
  if (!storefronts?.length) return []
  const [planIds, { data: pubPages }, { data: excludedRows }] = await Promise.all([
    getOwnerPlanIds(admin, storefronts.map((storefront) => storefront.owner_id)),
    admin
      .from('pages')
      .select('id, storefront_id, owner_id')
      .eq('is_published', true)
      .returns<Array<{ id: string; storefront_id: string | null; owner_id: string | null }>>(),
    admin
      .from('marketplace_curations')
      .select('page_id')
      .eq('status', 'excluded')
      .returns<Array<{ page_id: string }>>(),
  ])
  const excludedPageIds = new Set((excludedRows ?? []).map((row) => row.page_id))
  const counts = new Map<string, number>()
  for (const p of pubPages ?? []) {
    if (p.storefront_id && !excludedPageIds.has(p.id)) {
      counts.set(p.storefront_id, (counts.get(p.storefront_id) ?? 0) + 1)
    }
  }
  return storefronts
    .map((s) => ({
      handle: s.handle,
      display_name: s.display_name,
      logo_url: planAllows(planIds[s.owner_id], 'whiteLabel') ? s.logo_url : null,
      listing_count: counts.get(s.id) ?? 0,
    }))
    .filter((s) => s.listing_count > 0)
    .sort((a, b) => b.listing_count - a.listing_count)
    .slice(0, limit)
}

/**
 * All storefronts an account owns + each one's published-listing count, oldest first (the
 * first is the account's "primary"). For the Storefront-settings picker + the GET side of
 * the storefront API. Service-role, but the caller MUST pass the authenticated user's own
 * id - this is owner-scoped data, never client-supplied.
 */
export async function loadStorefrontsForOwner(ownerId: string): Promise<StorefrontWithCount[]> {
  const clean = (ownerId || '').trim()
  if (!clean || !hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const { data: storefronts } = await admin
    .from('storefronts')
    .select('id, owner_id, handle, display_name, description, logo_url, accent_color, plan_suspended_at, created_at')
    .eq('owner_id', clean)
    .order('created_at', { ascending: true })
    .returns<Storefront[]>()
  if (!storefronts?.length) return []
  const { data: pubPages } = await admin
    .from('pages')
    .select('storefront_id')
    .eq('owner_id', clean)
    .eq('is_published', true)
    .returns<Array<{ storefront_id: string | null }>>()
  const counts = new Map<string, number>()
  for (const p of pubPages ?? []) {
    if (p.storefront_id) counts.set(p.storefront_id, (counts.get(p.storefront_id) ?? 0) + 1)
  }
  return storefronts.map((s) => ({ ...s, listing_count: counts.get(s.id) ?? 0 }))
}
