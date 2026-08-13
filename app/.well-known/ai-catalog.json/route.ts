import { ArdListing, buildAiCatalog, ARD_DEFAULT_LIMITS } from '../../../lib/ard-catalog'
import { loadPublicStorefronts } from '../../../lib/server/storefront'
import { supabase } from '../../../lib/supabase'

// Agentic Resource Discovery catalog. Mirrors the shape of the sibling
// .well-known/mcp.json route: read published + MCP-enabled listings from
// pages_public (NEVER the base `pages` table), pair them with the per-merchant
// storefront endpoints, and fail soft to a platform-only catalog.
const ARD_SELECT = ['name', 'slug', 'description', 'location', 'created_at', 'mcp_enabled'].join(', ')

export async function GET() {
  const { data, error } = await supabase
    .from('pages_public')
    .select(ARD_SELECT)
    .eq('is_published', true)
    .eq('mcp_enabled', true)
    .order('created_at', { ascending: false })
    .limit(ARD_DEFAULT_LIMITS.listings)
    .returns<ArdListing[]>()

  // Service-role + serving-aware; returns [] without admin env (dev).
  const storefronts = (await loadPublicStorefronts(ARD_DEFAULT_LIMITS.storefronts)).map((s) => ({
    handle: s.handle,
    display_name: s.display_name,
    listing_count: s.listing_count,
  }))

  // A listings query failure still leaves a valid, useful catalog: the platform
  // MCP server and search API are the entries registries need most.
  const body = buildAiCatalog(error ? [] : (data ?? []), storefronts)

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=120, s-maxage=600',
      // Out of Google's index; ARD registries still fetch this freely.
      'X-Robots-Tag': 'noindex',
    },
  })
}
