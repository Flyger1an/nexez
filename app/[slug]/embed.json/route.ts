import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../../../lib/artifact-cors'
import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { buildAgentReadyKit, buildArtifactRedirects } from '../../../lib/agent-ready-kit'
import { buildJsonLd } from '../../../lib/page-jsonld'
import { safeJsonScript } from '../../../lib/safe-json'
import { verificationMetaTag, websiteHostOf } from '../../../lib/website-verification'
import { captureEvent } from '../../../lib/observability'
import { supabase } from '../../../lib/supabase'
import { renamedPageArtifactRedirect } from '../../../lib/server/public-identifier'

/**
 * Public embed manifest for a listing: `GET /<slug>/embed.json`.
 *
 * The "fetch-my-artifacts" seam of the plugin pivot. A merchant's WordPress
 * plugin (or Shopify app / any server-side embedder) fetches THIS once and gets
 * ready-to-inject data, legacy server-rendered snippets, absolute artifact URLs,
 * and the 301 redirect map. Structured consumers should use `structuredData`
 * and `artifacts`; the string snippets remain for backwards compatibility.
 *
 * Exposes only already-public listing data (same read as agent.json), so it's
 * ungated like the other per-slug artifacts. It must NOT project owner-private
 * fields (website_verified_at / website_verified_method are absent from
 * PUBLIC_PAGE_SELECT and are never added here). CORS-open so it's fetchable
 * cross-origin from the merchant's own stack.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!page) {
    const redirect = await renamedPageArtifactRedirect(request, slug)
    if (redirect) return redirect
    return Response.json({ error: 'Not found' }, { status: 404, headers: ARTIFACT_CORS_HEADERS })
  }

  // Artifact URLs live on the platform's canonical host (hardened against XFH
  // reflection); the JSON-LD self-references the merchant's OWN domain when they
  // have one on file (public `website_url`), else the platform listing URL.
  const base = getRequestBaseUrl(request).replace(/\/$/, '')
  const listingUrl = `${base}/${slug}`
  const websiteHost = websiteHostOf(page.website_url)
  const websiteBase = websiteHost ? `https://${websiteHost}` : listingUrl

  // Reuse the kit for the escaped <link> (href on the platform base); the JSON-LD
  // is built separately so it can self-reference the merchant domain.
  const headLink = buildAgentReadyKit(page, { baseUrl: base }).find((b) => b.id === 'head_link')?.content ?? ''
  const structuredData = buildJsonLd(page, base)
  structuredData.url = websiteBase
  structuredData.mainEntity.url = websiteBase
  const jsonld = `<script type="application/ld+json">${safeJsonScript(structuredData)}</script>`
  const mcpEnabled = Boolean((page as { mcp_enabled?: boolean }).mcp_enabled)

  captureEvent('embed.fetch', { slug, host: websiteHost ?? null })

  return Response.json(
    {
      ok: true,
      slug,
      name: page.name || slug,
      base,
      websiteBase,
      structuredData,
      // Backwards-compatible snippets for existing non-WordPress embedders.
      // The WordPress plugin consumes the structured fields and builds markup
      // locally so remote HTML is never printed into a merchant site.
      jsonld,
      headLink,
      // Template only - the real token is issued per-owner in Settings and is never
      // exposed on this public endpoint.
      metaHint: verificationMetaTag('YOUR_VERIFICATION_TOKEN'),
      artifacts: {
        agentJson: `${listingUrl}/agent.json`,
        llms: `${listingUrl}/llms.txt`,
        openapi: `${listingUrl}/openapi.json`,
        mcp: mcpEnabled ? `${listingUrl}/mcp.json` : null,
        badge: `${listingUrl}/badge.svg`,
      },
      redirects: buildArtifactRedirects(page, { baseUrl: base }),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=900',
        Vary: 'x-forwarded-host',
        ...ARTIFACT_CORS_HEADERS,
      },
    },
  )
}

export function OPTIONS() {
  return artifactPreflight()
}
