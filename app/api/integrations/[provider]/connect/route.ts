import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { ownerAllows } from '../../../../../lib/server/plan'
import { requirePageAccess } from '../../../../../lib/server/require-page-access'
import { appUrl } from '../../../../../lib/site'
import {
  buildConnectorAuthorizationUrl,
  connectorOAuthConfigured,
  connectorStateCookie,
  createConnectorState,
  isManagedConnectorProvider,
  isOAuthConnectorProvider,
  merchantConnectorStorageConfigured,
  resolvedWooCommerceSiteError,
  resolveWooCommerceSiteOrigin,
} from '../../../../../lib/server/merchant-connectors'

export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const limited = await enforceRateLimit(request, 'connector-oauth-start', 20, 60_000)
  if (limited) return limited

  const { provider } = await ctx.params
  if (!isManagedConnectorProvider(provider)) {
    return NextResponse.json({ error: 'Unsupported integration.' }, { status: 404 })
  }
  const url = new URL(request.url)
  const pageId = url.searchParams.get('pageId') || ''
  if (!pageId) return NextResponse.json({ error: 'pageId is required.' }, { status: 400 })

  const gate = await requirePageAccess({ pageId, unavailableMessage: 'Integration connections are not configured.' })
  if (!gate.ok) return gate.response
  if (!(await ownerAllows(gate.admin, gate.access.ownerId, 'integrations'))) {
    return NextResponse.json({ error: 'Live integrations require Pro or higher.' }, { status: 402 })
  }
  if (!merchantConnectorStorageConfigured()) {
    return NextResponse.json({ error: 'Integration credential storage is not configured.' }, { status: 503 })
  }

  let siteUrl: string | undefined
  if (provider === 'woocommerce') {
    siteUrl = resolveWooCommerceSiteOrigin(url.searchParams.get('siteUrl') || '') || undefined
    if (!siteUrl) return NextResponse.json({ error: 'Enter a public WooCommerce HTTPS store URL.' }, { status: 400 })
    const endpointError = await resolvedWooCommerceSiteError(siteUrl)
    if (endpointError) return NextResponse.json({ error: endpointError }, { status: 400 })
  } else if (!isOAuthConnectorProvider(provider) || !connectorOAuthConfigured(provider)) {
    return NextResponse.json({ error: `${provider} OAuth is not configured.` }, { status: 503 })
  }

  const state = createConnectorState({
    provider,
    pageId: gate.access.pageId,
    ownerId: gate.access.ownerId,
    userId: gate.user.id,
    ...(siteUrl ? { siteUrl } : {}),
  })
  if (!state) return NextResponse.json({ error: 'Could not secure the OAuth request.' }, { status: 503 })

  if (provider === 'woocommerce') {
    const authorize = new URL(`${siteUrl}/wc-auth/v1/authorize`)
    authorize.searchParams.set('app_name', 'Nexez')
    authorize.searchParams.set('scope', 'read')
    authorize.searchParams.set('user_id', state)
    authorize.searchParams.set('return_url', appUrl(`/dashboard/${gate.access.pageId}/settings?section=integrations&provider=woocommerce`))
    authorize.searchParams.set('callback_url', appUrl('/api/integrations/woocommerce/callback'))
    return NextResponse.redirect(authorize.toString(), 302)
  }

  const authorizationUrl = buildConnectorAuthorizationUrl(provider, state)
  if (!authorizationUrl) return NextResponse.json({ error: 'OAuth is not configured.' }, { status: 503 })
  const jar = await cookies()
  jar.set(connectorStateCookie(provider), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/api/integrations/${provider}`,
    maxAge: 600,
  })
  return NextResponse.redirect(authorizationUrl, 302)
}
