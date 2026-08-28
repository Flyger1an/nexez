import 'server-only'
import { NextResponse } from 'next/server'
import { agentRuntimeUrl } from '../site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { resolveShopDomain } from './integration-importers'
import { shopifyConfigured, verifyShopifyAppProxySignature } from './shopify'
import { activeShopifyInstallMapping, getInstallByShop } from './shopify-install'

const ALLOWED_ARTIFACTS = new Set(['agent.json', 'llms.txt', 'openapi.json', 'mcp.json', 'embed.json'])
const FORWARDED_ARTIFACT_HEADERS = [
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'cache-control',
  'content-language',
  'content-type',
  'vary',
] as const

async function serveArtifact(slug: string, artifact: string) {
  const upstreamUrl = agentRuntimeUrl(`/${slug}/${artifact}`)

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: artifact.endsWith('.txt') ? 'text/plain' : 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
    })

    if (!upstream.ok) {
      console.error('[shopify-proxy] artifact upstream failed', {
        artifact,
        slug,
        status: upstream.status,
      })
      return NextResponse.json({ error: 'The linked artifact is unavailable.' }, { status: 502 })
    }

    const headers = new Headers()
    for (const name of FORWARDED_ARTIFACT_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('x-content-type-options', 'nosniff')

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('[shopify-proxy] artifact fetch failed', {
      artifact,
      slug,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'The linked artifact is unavailable.' }, { status: 502 })
  }
}

/**
 * Resolve a signed Shopify App Proxy request to a linked Nexez artifact.
 * `artifactPath` is supplied by the child route; the query parameter keeps the
 * proxy root backwards compatible with the first release.
 */
export async function handleShopifyProxy(request: Request, artifactPath?: string) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: 'Shopify app is not configured.' }, { status: 404 })
  }

  const params = new URL(request.url).searchParams
  if (!verifyShopifyAppProxySignature(params)) {
    return NextResponse.json({ error: 'Invalid App Proxy signature.' }, { status: 401 })
  }

  const artifact = (artifactPath || params.get('artifact') || 'agent.json').replace(/^\/+|\/+$/g, '')
  if (!ALLOWED_ARTIFACTS.has(artifact)) {
    return NextResponse.json({ error: 'Unknown artifact.' }, { status: 404 })
  }

  const shop = resolveShopDomain(params.get('shop') || '')
  if (!shop || !hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const admin = createAdminClient()
  const install = await getInstallByShop(admin, shop)
  const mapping = install ? activeShopifyInstallMapping(install) : null
  if (!mapping) {
    return NextResponse.json({ error: 'This shop is not linked to a Nexez listing.' }, { status: 404 })
  }

  // Signed App Proxy artifacts are part of the installed Shopify connector and
  // remain available on every plan. The signature plus exact active install
  // mapping are the authorization boundary here.
  const { data } = await admin
    .from('pages')
    .select('slug')
    .eq('id', mapping.pageId)
    .eq('owner_id', mapping.ownerId)
    .maybeSingle()
  const slug = (data as { slug?: string } | null)?.slug
  if (!slug) {
    return NextResponse.json({ error: 'Linked listing not found.' }, { status: 404 })
  }

  return serveArtifact(slug, artifact)
}
