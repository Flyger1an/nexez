import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { SHOPIFY_SCOPES, shopifyApiKey, shopifyConfigured } from '../../../../lib/server/shopify'
import { resolveShopDomain } from '../../../../lib/server/integration-importers'
import { appUrl } from '../../../../lib/site'

/**
 * Shopify OAuth install start: `GET /api/shopify/auth?shop=<store>.myshopify.com`.
 * Validates the shop (SSRF pin), sets a CSRF `state` cookie, and redirects to
 * Shopify's authorize screen. INERT (404) until SHOPIFY_API_KEY/SECRET are set.
 */
export async function GET(request: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: 'Shopify app is not configured.' }, { status: 404 })
  }
  const shop = resolveShopDomain(new URL(request.url).searchParams.get('shop') || '')
  if (!shop) {
    return NextResponse.json({ error: 'Invalid shop parameter.' }, { status: 400 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  const authorize = new URL(`https://${shop}/admin/oauth/authorize`)
  authorize.searchParams.set('client_id', shopifyApiKey())
  authorize.searchParams.set('scope', SHOPIFY_SCOPES)
  authorize.searchParams.set('redirect_uri', appUrl('/api/shopify/callback'))
  authorize.searchParams.set('state', state)
  return NextResponse.redirect(authorize.toString(), 302)
}
