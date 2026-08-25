import 'server-only'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CONNECTOR_MANIFEST, connectorCapabilities, type ConnectorProvider } from '../integration-capabilities'
import { appUrl } from '../site'
import { decryptSecret, encryptSecret, hasSecretCryptoKey } from './secret-crypto'
import { hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getResolvedWebhookEndpointError, getWebhookEndpointError } from '../webhooks'

export const MANAGED_CONNECTOR_PROVIDERS = ['square', 'acuity', 'google_calendar', 'woocommerce', 'servicem8'] as const
export type ManagedConnectorProvider = (typeof MANAGED_CONNECTOR_PROVIDERS)[number]
export type OAuthConnectorProvider = Exclude<ManagedConnectorProvider, 'woocommerce'>

export type OAuthCredential = {
  accessToken: string
  refreshToken: string | null
  tokenType: string
  expiresAt: string | null
}

export type WooCommerceCredential = {
  siteUrl: string
  consumerKey: string
  consumerSecret: string
}

export type MerchantConnectorCredential = OAuthCredential | WooCommerceCredential

export type MerchantConnectorRow = {
  page_id: string
  owner_id: string
  provider: ManagedConnectorProvider
  credential_encrypted: string
  status: 'connected' | 'attention' | 'revoked'
  external_account_id: string | null
  granted_scopes: string[] | null
  capabilities: string[] | null
  expires_at: string | null
  last_synced_at: string | null
  last_error: string | null
  metadata: Record<string, unknown> | null
  updated_at: string
}

export type ConnectorOAuthState = {
  version: 1
  provider: ManagedConnectorProvider
  pageId: string
  ownerId: string
  userId: string
  issuedAt: number
  nonce: string
  siteUrl?: string
}

const OAUTH_STATE_MAX_AGE_MS = 10 * 60_000
const TOKEN_TIMEOUT_MS = 10_000
const REFRESH_SKEW_MS = 25 * 60 * 60_000
const SQUARE_REFRESH_SKEW_MS = 23 * 24 * 60 * 60_000
const CREDENTIAL_REFRESH_BATCH_SIZE = 25
export const SQUARE_API_VERSION = '2026-07-15'

const OAUTH_SCOPES: Record<OAuthConnectorProvider, readonly string[]> = {
  square: [
    'ITEMS_READ',
    'APPOINTMENTS_READ',
    'APPOINTMENTS_ALL_READ',
    'APPOINTMENTS_BUSINESS_SETTINGS_READ',
  ],
  acuity: ['api-v1'],
  google_calendar: ['https://www.googleapis.com/auth/calendar.freebusy'],
  servicem8: ['vendor', 'read_jobs'],
}

export function squareApiBaseUrl(): string {
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'
}

function oauthClient(provider: OAuthConnectorProvider): { id: string; secret: string } | null {
  const values = provider === 'square'
    ? [process.env.SQUARE_APPLICATION_ID, process.env.SQUARE_APPLICATION_SECRET]
    : provider === 'acuity'
      ? [process.env.ACUITY_CLIENT_ID, process.env.ACUITY_CLIENT_SECRET]
      : provider === 'google_calendar'
        ? [process.env.GOOGLE_CALENDAR_CLIENT_ID, process.env.GOOGLE_CALENDAR_CLIENT_SECRET]
        : [process.env.SERVICEM8_APP_ID, process.env.SERVICEM8_APP_SECRET]
  const [id, secret] = values.map((value) => String(value || '').trim())
  return id && secret ? { id, secret } : null
}

export function isManagedConnectorProvider(value: string): value is ManagedConnectorProvider {
  return (MANAGED_CONNECTOR_PROVIDERS as readonly string[]).includes(value)
}

export function isOAuthConnectorProvider(value: string): value is OAuthConnectorProvider {
  return value === 'square' || value === 'acuity' || value === 'google_calendar' || value === 'servicem8'
}

export function merchantConnectorStorageConfigured(): boolean {
  return hasSupabaseAdminEnv() && hasSecretCryptoKey()
}

export function connectorOAuthConfigured(provider: OAuthConnectorProvider): boolean {
  return merchantConnectorStorageConfigured() && oauthClient(provider) !== null
}

export function connectorCallbackUrl(provider: OAuthConnectorProvider): string {
  return appUrl(`/api/integrations/${provider}/callback`)
}

export function connectorStateCookie(provider: ManagedConnectorProvider): string {
  return `nexez_connector_oauth_${provider}`
}

export function createConnectorState(input: Omit<ConnectorOAuthState, 'version' | 'issuedAt' | 'nonce'>): string | null {
  return encryptSecret(JSON.stringify({
    ...input,
    version: 1,
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  } satisfies ConnectorOAuthState))
}

export function readConnectorState(raw: string, expectedProvider: ManagedConnectorProvider): ConnectorOAuthState | null {
  const decrypted = decryptSecret(raw)
  if (!decrypted) return null
  try {
    const state = JSON.parse(decrypted) as ConnectorOAuthState
    if (
      state.version !== 1
      || state.provider !== expectedProvider
      || !state.pageId
      || !state.ownerId
      || !state.userId
      || !state.nonce
      || !Number.isFinite(state.issuedAt)
      || state.issuedAt > Date.now() + 30_000
      || Date.now() - state.issuedAt > OAUTH_STATE_MAX_AGE_MS
    ) return null
    return state
  } catch {
    return null
  }
}

export function buildConnectorAuthorizationUrl(provider: OAuthConnectorProvider, state: string): string | null {
  const client = oauthClient(provider)
  if (!client) return null
  const redirectUri = connectorCallbackUrl(provider)
  if (provider === 'square') {
    const url = new URL(`${squareApiBaseUrl()}/oauth2/authorize`)
    url.searchParams.set('client_id', client.id)
    url.searchParams.set('scope', OAUTH_SCOPES.square.join(' '))
    url.searchParams.set('state', state)
    url.searchParams.set('redirect_uri', redirectUri)
    if (process.env.SQUARE_ENVIRONMENT !== 'sandbox') url.searchParams.set('session', 'false')
    return url.toString()
  }
  if (provider === 'google_calendar') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', client.id)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', OAUTH_SCOPES.google_calendar.join(' '))
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', state)
    return url.toString()
  }
  if (provider === 'acuity') {
    const url = new URL('https://acuityscheduling.com/oauth2/authorize')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', OAUTH_SCOPES.acuity.join(' '))
    url.searchParams.set('client_id', client.id)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
  }
  const url = new URL('https://go.servicem8.com/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', client.id)
  url.searchParams.set('scope', OAUTH_SCOPES.servicem8.join(' '))
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  return url.toString()
}

export function resolveWooCommerceSiteOrigin(input: string): string | null {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    const origin = url.toString().replace(/\/$/, '')
    return getWebhookEndpointError(origin) ? null : origin
  } catch {
    return null
  }
}

export async function resolvedWooCommerceSiteError(siteUrl: string): Promise<string | null> {
  return getResolvedWebhookEndpointError(siteUrl)
}

function scopesFrom(value: unknown, fallback: readonly string[]): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return value.split(/[ ,]+/).filter(Boolean)
  return [...fallback]
}

function expiryFrom(value: unknown, expiresIn: unknown): string | null {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString()
  const seconds = Number(expiresIn)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null
}

async function fetchToken(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal })
    if (!response.ok) return null
    return await response.json() as Record<string, unknown>
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function exchangeConnectorCode(
  provider: OAuthConnectorProvider,
  code: string,
): Promise<{ credential: OAuthCredential; externalAccountId: string | null; scopes: string[] } | null> {
  const client = oauthClient(provider)
  if (!client) return null
  const redirectUri = connectorCallbackUrl(provider)
  let json: Record<string, unknown> | null
  if (provider === 'square') {
    json = await fetchToken(`${squareApiBaseUrl()}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'Square-Version': SQUARE_API_VERSION },
      body: JSON.stringify({ client_id: client.id, client_secret: client.secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
    })
  } else {
    const body = new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })
    json = await fetchToken(
      provider === 'google_calendar'
        ? 'https://oauth2.googleapis.com/token'
        : provider === 'acuity'
          ? 'https://acuityscheduling.com/oauth2/token'
          : 'https://go.servicem8.com/oauth/access_token',
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body },
    )
  }
  const accessToken = String(json?.access_token || '')
  if (!accessToken) return null
  return {
    credential: {
      accessToken,
      refreshToken: json?.refresh_token ? String(json.refresh_token) : null,
      tokenType: String(json?.token_type || 'Bearer'),
      expiresAt: expiryFrom(json?.expires_at, json?.expires_in),
    },
    externalAccountId: provider === 'square' ? String(json?.merchant_id || '') || null : null,
    scopes: scopesFrom(json?.scope, OAUTH_SCOPES[provider]),
  }
}

function encryptedCredential(value: MerchantConnectorCredential): string | null {
  return encryptSecret(JSON.stringify(value))
}

export async function upsertMerchantConnectorConnection(
  admin: SupabaseClient,
  input: {
    pageId: string
    ownerId: string
    provider: ManagedConnectorProvider
    credential: MerchantConnectorCredential
    externalAccountId?: string | null
    scopes?: string[]
    metadata?: Record<string, unknown>
  },
): Promise<boolean> {
  const encrypted = encryptedCredential(input.credential)
  if (!encrypted) return false
  const expiresAt = 'expiresAt' in input.credential ? input.credential.expiresAt : null
  const { error } = await admin.from('merchant_connector_connections').upsert({
    page_id: input.pageId,
    owner_id: input.ownerId,
    provider: input.provider,
    credential_encrypted: encrypted,
    status: 'connected',
    external_account_id: input.externalAccountId ?? null,
    granted_scopes: input.scopes ?? [],
    capabilities: [...connectorCapabilities(input.provider)],
    expires_at: expiresAt,
    last_error: null,
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'page_id,provider' })
  if (error) return false
  await admin.from('user_integrations').upsert({
    user_id: input.ownerId,
    provider: input.provider,
    status: 'connected',
    detail: `${CONNECTOR_MANIFEST[input.provider].label} connected to a listing.`,
    last_event_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })
  return true
}

async function refreshCredential(
  provider: OAuthConnectorProvider,
  current: OAuthCredential,
): Promise<OAuthCredential | null> {
  const client = oauthClient(provider)
  if (!client || !current.refreshToken) return null
  let json: Record<string, unknown> | null
  if (provider === 'square') {
    json = await fetchToken(`${squareApiBaseUrl()}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'Square-Version': SQUARE_API_VERSION },
      body: JSON.stringify({ client_id: client.id, client_secret: client.secret, refresh_token: current.refreshToken, grant_type: 'refresh_token' }),
    })
  } else {
    if (provider === 'acuity') return null
    const body = new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      refresh_token: current.refreshToken,
      grant_type: 'refresh_token',
    })
    json = await fetchToken(
      provider === 'google_calendar' ? 'https://oauth2.googleapis.com/token' : 'https://go.servicem8.com/oauth/access_token',
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body },
    )
  }
  const accessToken = String(json?.access_token || '')
  if (!accessToken) return null
  return {
    accessToken,
    refreshToken: json?.refresh_token ? String(json.refresh_token) : current.refreshToken,
    tokenType: String(json?.token_type || current.tokenType || 'Bearer'),
    expiresAt: expiryFrom(json?.expires_at, json?.expires_in),
  }
}

export async function getMerchantConnectorRow(
  admin: SupabaseClient,
  pageId: string,
  provider: ManagedConnectorProvider,
): Promise<MerchantConnectorRow | null> {
  const { data } = await admin
    .from('merchant_connector_connections')
    .select('page_id,owner_id,provider,credential_encrypted,status,external_account_id,granted_scopes,capabilities,expires_at,last_synced_at,last_error,metadata,updated_at')
    .eq('page_id', pageId)
    .eq('provider', provider)
    .maybeSingle<MerchantConnectorRow>()
  return data ?? null
}

export async function getUsableConnectorCredential(
  admin: SupabaseClient,
  pageId: string,
  provider: ManagedConnectorProvider,
): Promise<{ ok: true; credential: MerchantConnectorCredential; row: MerchantConnectorRow } | { ok: false; error: string }> {
  const row = await getMerchantConnectorRow(admin, pageId, provider)
  if (!row || row.status === 'revoked') return { ok: false, error: `Connect ${CONNECTOR_MANIFEST[provider].label} in Settings before syncing.` }
  const raw = decryptSecret(row.credential_encrypted)
  if (!raw) return { ok: false, error: `${CONNECTOR_MANIFEST[provider].label} credentials could not be decrypted. Reconnect the integration.` }
  let credential: MerchantConnectorCredential
  try {
    credential = JSON.parse(raw) as MerchantConnectorCredential
  } catch {
    return { ok: false, error: `${CONNECTOR_MANIFEST[provider].label} credentials are invalid. Reconnect the integration.` }
  }
  if (provider === 'woocommerce') return { ok: true, credential, row }
  const oauth = credential as OAuthCredential
  if (!oauth.accessToken) return { ok: false, error: `${CONNECTOR_MANIFEST[provider].label} credentials are invalid. Reconnect the integration.` }
  const expires = oauth.expiresAt ? Date.parse(oauth.expiresAt) : Number.POSITIVE_INFINITY
  const refreshSkew = provider === 'square' ? SQUARE_REFRESH_SKEW_MS : REFRESH_SKEW_MS
  if (expires > Date.now() + refreshSkew) return { ok: true, credential: oauth, row }
  const refreshed = await refreshCredential(provider, oauth)
  if (!refreshed) {
    await admin.from('merchant_connector_connections').update({
      status: 'attention',
      last_error: 'Authorization expired. Reconnect this integration.',
      updated_at: new Date().toISOString(),
    }).eq('page_id', pageId).eq('provider', provider)
    return { ok: false, error: `${CONNECTOR_MANIFEST[provider].label} authorization expired. Reconnect the integration.` }
  }
  const encrypted = encryptedCredential(refreshed)
  if (!encrypted) return { ok: false, error: 'Integration credential storage is not configured.' }
  await admin.from('merchant_connector_connections').update({
    credential_encrypted: encrypted,
    expires_at: refreshed.expiresAt,
    status: 'connected',
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('page_id', pageId).eq('provider', provider)
  return { ok: true, credential: refreshed, row: { ...row, credential_encrypted: encrypted, expires_at: refreshed.expiresAt, status: 'connected', last_error: null } }
}

export async function listMerchantConnectorRows(admin: SupabaseClient, pageId: string): Promise<MerchantConnectorRow[]> {
  const { data } = await admin
    .from('merchant_connector_connections')
    .select('page_id,owner_id,provider,credential_encrypted,status,external_account_id,granted_scopes,capabilities,expires_at,last_synced_at,last_error,metadata,updated_at')
    .eq('page_id', pageId)
  return (data as MerchantConnectorRow[] | null) ?? []
}

export async function recordMerchantConnectorSync(
  admin: SupabaseClient,
  pageId: string,
  provider: ManagedConnectorProvider,
  input: { ok: boolean; error?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  const now = new Date().toISOString()
  const values: Record<string, unknown> = {
    status: input.ok ? 'connected' : 'attention',
    last_error: input.ok ? null : input.error || 'Sync failed.',
    updated_at: now,
  }
  if (input.ok) values.last_synced_at = now
  if (input.metadata) values.metadata = input.metadata
  await admin.from('merchant_connector_connections').update(values).eq('page_id', pageId).eq('provider', provider)
}

export async function refreshDueMerchantConnectorCredentials(
  admin: SupabaseClient,
): Promise<{ selected: number; refreshed: number; failed: number }> {
  const now = Date.now()
  const columns = 'page_id,provider,expires_at'
  const [squareResult, otherResult] = await Promise.all([
    admin
      .from('merchant_connector_connections')
      .select(columns)
      .eq('status', 'connected')
      .eq('provider', 'square')
      .not('expires_at', 'is', null)
      .lte('expires_at', new Date(now + SQUARE_REFRESH_SKEW_MS).toISOString())
      .order('expires_at', { ascending: true })
      .limit(CREDENTIAL_REFRESH_BATCH_SIZE),
    admin
      .from('merchant_connector_connections')
      .select(columns)
      .eq('status', 'connected')
      .in('provider', ['google_calendar', 'servicem8'])
      .not('expires_at', 'is', null)
      .lte('expires_at', new Date(now + REFRESH_SKEW_MS).toISOString())
      .order('expires_at', { ascending: true })
      .limit(CREDENTIAL_REFRESH_BATCH_SIZE),
  ])
  if (squareResult.error || otherResult.error) {
    return { selected: 0, refreshed: 0, failed: 1 }
  }
  type DueCredential = { page_id: string; provider: OAuthConnectorProvider; expires_at: string }
  const selected = [
    ...((squareResult.data as DueCredential[] | null) ?? []),
    ...((otherResult.data as DueCredential[] | null) ?? []),
  ]
  let refreshed = 0
  let failed = 0
  for (const row of selected) {
    const result = await getUsableConnectorCredential(admin, row.page_id, row.provider)
    if (!result.ok) {
      failed += 1
      continue
    }
    const credential = result.credential as OAuthCredential
    if (credential.expiresAt && credential.expiresAt !== row.expires_at) refreshed += 1
  }
  return { selected: selected.length, refreshed, failed }
}

async function revokeRemote(provider: ManagedConnectorProvider, credential: MerchantConnectorCredential): Promise<boolean> {
  if (provider === 'square') {
    const client = oauthClient('square')
    if (!client) return false
    const response = await fetch(`${squareApiBaseUrl()}/oauth2/revoke`, {
      method: 'POST',
      headers: {
        authorization: `Client ${client.secret}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'Square-Version': SQUARE_API_VERSION,
      },
      body: JSON.stringify({ client_id: client.id, access_token: (credential as OAuthCredential).accessToken }),
      redirect: 'error',
    }).catch(() => null)
    return Boolean(response?.ok)
  }
  if (provider === 'google_calendar') {
    const token = (credential as OAuthCredential).refreshToken || (credential as OAuthCredential).accessToken
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ token }),
      redirect: 'error',
    }).catch(() => null)
    return Boolean(response?.ok)
  }
  if (provider === 'acuity') {
    const client = oauthClient('acuity')
    if (!client) return false
    const response = await fetch('https://acuityscheduling.com/oauth2/disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        access_token: (credential as OAuthCredential).accessToken,
        client_id: client.id,
        client_secret: client.secret,
      }),
      redirect: 'error',
    }).catch(() => null)
    return Boolean(response?.ok)
  }
  return true
}

export async function disconnectMerchantConnector(
  admin: SupabaseClient,
  pageId: string,
  ownerId: string,
  provider: ManagedConnectorProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await getUsableConnectorCredential(admin, pageId, provider)
  if (current.ok && !(await revokeRemote(provider, current.credential))) {
    return { ok: false, error: `Could not revoke ${CONNECTOR_MANIFEST[provider].label} access. Try again.` }
  }
  const { error } = await admin.from('merchant_connector_connections').delete().eq('page_id', pageId).eq('provider', provider)
  if (error) return { ok: false, error: 'Could not remove the connection.' }
  const { data: remaining } = await admin
    .from('merchant_connector_connections')
    .select('page_id')
    .eq('owner_id', ownerId)
    .eq('provider', provider)
    .limit(1)
  if (!remaining?.length) {
    await admin.from('user_integrations').delete().eq('user_id', ownerId).eq('provider', provider)
  }
  return { ok: true }
}
