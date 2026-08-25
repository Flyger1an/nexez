import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { appUrl } from '../../../../../lib/site'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { ownerAllows } from '../../../../../lib/server/plan'
import { requirePageAccess } from '../../../../../lib/server/require-page-access'
import { syncPageIntegration } from '../../../../../lib/server/integration-sync'
import {
  connectorStateCookie,
  discardMerchantConnectorCredential,
  exchangeConnectorCode,
  isOAuthConnectorProvider,
  readConnectorState,
  recordMerchantConnectorSync,
  upsertMerchantConnectorConnection,
} from '../../../../../lib/server/merchant-connectors'

function settingsUrl(pageId: string, params: Record<string, string>): string {
  const url = new URL(appUrl(`/dashboard/${pageId}/settings`))
  url.searchParams.set('section', 'integrations')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const limited = await enforceRateLimit(request, 'connector-oauth-callback', 30, 60_000)
  if (limited) return limited
  const { provider } = await ctx.params
  if (!isOAuthConnectorProvider(provider)) {
    return NextResponse.json({ error: 'Unsupported OAuth callback.' }, { status: 404 })
  }
  const params = new URL(request.url).searchParams
  const stateParam = params.get('state') || ''
  const jar = await cookies()
  const stateCookie = jar.get(connectorStateCookie(provider))?.value || ''
  const state = stateParam && stateParam === stateCookie ? readConnectorState(stateParam, provider) : null
  if (!state) return NextResponse.json({ error: 'Invalid or expired OAuth state.' }, { status: 401 })

  // A valid state is single-use. Clear it before any later authorization or
  // provider step so a failed callback cannot be replayed within the TTL.
  jar.set(connectorStateCookie(provider), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/api/integrations/${provider}`,
    maxAge: 0,
  })

  const gate = await requirePageAccess({ pageId: state.pageId, unavailableMessage: 'Integration connections are not configured.' })
  if (!gate.ok) return gate.response
  if (gate.user.id !== state.userId || gate.access.ownerId !== state.ownerId) {
    return NextResponse.json({ error: 'OAuth ownership changed. Start the connection again.' }, { status: 403 })
  }
  if (!(await ownerAllows(gate.admin, gate.access.ownerId, 'integrations'))) {
    return NextResponse.json({ error: 'Live integrations require Pro or higher.' }, { status: 402 })
  }

  if (params.get('error')) {
    return NextResponse.redirect(settingsUrl(state.pageId, { provider, connection: 'cancelled' }), 302)
  }
  const code = params.get('code') || ''
  if (!code) return NextResponse.json({ error: 'Missing authorization code.' }, { status: 400 })
  const exchanged = await exchangeConnectorCode(provider, code)
  if (!exchanged) {
    return NextResponse.redirect(settingsUrl(state.pageId, { provider, connection: 'failed' }), 302)
  }
  const saved = await upsertMerchantConnectorConnection(gate.admin, {
    pageId: state.pageId,
    ownerId: state.ownerId,
    provider,
    credential: exchanged.credential,
    externalAccountId: exchanged.externalAccountId,
    scopes: exchanged.scopes,
  })
  if (!saved) {
    await discardMerchantConnectorCredential(provider, exchanged.credential)
    return NextResponse.redirect(settingsUrl(state.pageId, { provider, connection: 'failed' }), 302)
  }

  if (provider === 'google_calendar') {
    const { error } = await gate.admin.from('pages').update({ google_calendar_id: 'primary' }).eq('id', state.pageId).is('google_calendar_id', null)
    if (error) {
      await recordMerchantConnectorSync(gate.admin, state.pageId, provider, {
        ok: false,
        error: 'Google Calendar connected, but the default calendar could not be saved. Try again.',
      })
      return NextResponse.redirect(settingsUrl(state.pageId, { provider, connection: 'attention' }), 302)
    }
  } else {
    const synced = await syncPageIntegration(gate.admin, provider, state.pageId, { trigger: 'oauth_callback' })
    if (!synced.ok) {
      return NextResponse.redirect(settingsUrl(state.pageId, { provider, connection: 'attention' }), 302)
    }
  }
  return NextResponse.redirect(settingsUrl(state.pageId, { provider, connection: 'connected' }), 302)
}
