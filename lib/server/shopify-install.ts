import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret, encryptSecret } from './secret-crypto'

/**
 * The shop→page mapping for Shopify installs. A Shopify install is keyed by shop
 * domain (an OAuth grant per store), whereas Nexez listings are page-id keyed —
 * this table bridges the two. The offline access token is encrypted at rest
 * (reuses INTEGRATION_SECRET_KEY); the table is service-role only (RLS on, no
 * policies, granted revoked from browser roles) so a token can never leak to an
 * anon/authenticated client.
 */

export type ShopifyInstall = {
  shop_domain: string
  owner_id: string | null
  page_id: string | null
  scope: string | null
  uninstalled_at: string | null
  linked_at?: string | null
  last_synced_at?: string | null
}

type ShopifyTokenRow = ShopifyInstall & {
  offline_token_encrypted: string | null
  refresh_token_encrypted: string | null
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
}

export type ShopifyInstallCredentials = {
  shop: string
  accessToken: string
}

const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000
const SHOPIFY_TOKEN_TIMEOUT_MS = 10_000

function encryptRequired(value: string): string {
  const encrypted = encryptSecret(value)
  if (!encrypted) throw new Error('Shopify credential encryption is not configured.')
  return encrypted
}

function expiresAt(seconds: number, now = Date.now()): string {
  return new Date(now + Math.max(1, seconds) * 1000).toISOString()
}

/** Active (not uninstalled) install for a shop, or null. Service-role client. */
export async function getInstallByShop(
  admin: Pick<SupabaseClient, 'from'>,
  shop: string,
): Promise<ShopifyInstall | null> {
  const { data } = await admin
    .from('shopify_installs')
    .select('shop_domain, owner_id, page_id, scope, uninstalled_at')
    .eq('shop_domain', shop)
    .is('uninstalled_at', null)
    .maybeSingle()
  return (data as ShopifyInstall) ?? null
}

/**
 * Upsert an install, encrypting the offline token at rest. owner_id / page_id
 * (the link to a Nexez listing, set in a later step) are only written when
 * EXPLICITLY provided — so a re-auth (the OAuth callback refreshing the token
 * without them) preserves an existing shop→listing link instead of nulling it.
 */
export async function upsertInstall(
  admin: Pick<SupabaseClient, 'from'>,
  input: {
    shop: string
    ownerId?: string | null
    pageId?: string | null
    offlineToken: string
    refreshToken: string
    expiresIn: number
    refreshTokenExpiresIn: number
    scope?: string | null
  },
): Promise<void> {
  const { data: existing, error: readError } = await admin
    .from('shopify_installs')
    .select('owner_id, page_id, uninstalled_at')
    .eq('shop_domain', input.shop)
    .maybeSingle<{ owner_id: string | null; page_id: string | null; uninstalled_at: string | null }>()
  if (readError) throw new Error('Could not read the Shopify installation.')

  const ownerChanged = Boolean(
    existing?.owner_id && input.ownerId !== undefined && input.ownerId !== existing.owner_id,
  )
  const mustRelink = !existing || Boolean(existing.uninstalled_at) || ownerChanged
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    shop_domain: input.shop,
    offline_token_encrypted: encryptRequired(input.offlineToken),
    refresh_token_encrypted: encryptRequired(input.refreshToken),
    access_token_expires_at: expiresAt(input.expiresIn),
    refresh_token_expires_at: expiresAt(input.refreshTokenExpiresIn),
    scope: input.scope ?? null,
    uninstalled_at: null,
    updated_at: now,
  }
  // A reinstall or owner change must never reactivate the previous merchant's
  // listing before the new browser explicitly completes the link step.
  if (mustRelink) {
    row.page_id = null
    row.linked_at = null
    row.last_synced_at = null
  }
  // Only in the payload (and therefore ON CONFLICT update) when provided.
  if (input.ownerId !== undefined) row.owner_id = input.ownerId
  if (input.pageId !== undefined) row.page_id = input.pageId
  const { error } = await admin.from('shopify_installs').upsert(row, { onConflict: 'shop_domain' })
  if (error) throw new Error('Could not save the Shopify installation.')
}

async function refreshInstallToken(
  admin: Pick<SupabaseClient, 'from'>,
  row: ShopifyTokenRow,
): Promise<ShopifyInstallCredentials | null> {
  const clientId = process.env.SHOPIFY_API_KEY
  const clientSecret = process.env.SHOPIFY_API_SECRET
  const refreshToken = decryptSecret(row.refresh_token_encrypted)
  if (!clientId || !clientSecret || !refreshToken) return null
  if (row.refresh_token_expires_at && Date.parse(row.refresh_token_expires_at) <= Date.now()) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SHOPIFY_TOKEN_TIMEOUT_MS)
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
    const response = await fetch(`https://${row.shop_domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const json = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      refresh_token_expires_in?: number
      scope?: string
    }
    const accessToken = String(json.access_token || '')
    const nextRefreshToken = String(json.refresh_token || '')
    const accessTtl = Number(json.expires_in || 0)
    const refreshTtl = Number(json.refresh_token_expires_in || 0)
    if (!accessToken || !nextRefreshToken || accessTtl <= 0 || refreshTtl <= 0) return null

    const update = {
      offline_token_encrypted: encryptRequired(accessToken),
      refresh_token_encrypted: encryptRequired(nextRefreshToken),
      access_token_expires_at: expiresAt(accessTtl),
      refresh_token_expires_at: expiresAt(refreshTtl),
      scope: json.scope ?? row.scope,
      updated_at: new Date().toISOString(),
    }
    const { error } = await admin.from('shopify_installs').update(update).eq('shop_domain', row.shop_domain)
    if (error) return null
    return { shop: row.shop_domain, accessToken }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Resolve an active OAuth install for a listing, refreshing its rotating token
 * before expiry. Manual page_secrets credentials remain a fallback in the sync
 * layer for merchants that have not installed the app. */
export async function getShopifyInstallCredentials(
  admin: Pick<SupabaseClient, 'from'>,
  pageId: string,
): Promise<ShopifyInstallCredentials | null> {
  const { data, error } = await admin
    .from('shopify_installs')
    .select('shop_domain, owner_id, page_id, scope, uninstalled_at, linked_at, last_synced_at, offline_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at')
    .eq('page_id', pageId)
    .is('uninstalled_at', null)
    .order('linked_at', { ascending: false })
    .limit(1)
    .maybeSingle<ShopifyTokenRow>()
  if (error || !data) return null

  const accessToken = decryptSecret(data.offline_token_encrypted)
  const expires = data.access_token_expires_at ? Date.parse(data.access_token_expires_at) : Number.POSITIVE_INFINITY
  if (accessToken && expires > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return { shop: data.shop_domain, accessToken }
  }
  return refreshInstallToken(admin, data)
}

export async function markShopifySynced(
  admin: Pick<SupabaseClient, 'from'>,
  pageId: string,
  at: string,
): Promise<void> {
  const { error } = await admin
    .from('shopify_installs')
    .update({ last_synced_at: at, updated_at: at })
    .eq('page_id', pageId)
    .is('uninstalled_at', null)
  if (error) throw new Error('Could not record the Shopify sync time.')
}

/** Mark a shop uninstalled and remove every live credential/link immediately. */
export async function markUninstalled(admin: Pick<SupabaseClient, 'from'>, shop: string, at: string): Promise<void> {
  const { error } = await admin
    .from('shopify_installs')
    .update({
      uninstalled_at: at,
      offline_token_encrypted: null,
      refresh_token_encrypted: null,
      access_token_expires_at: null,
      refresh_token_expires_at: null,
      owner_id: null,
      page_id: null,
      linked_at: null,
      last_synced_at: null,
      updated_at: at,
    })
    .eq('shop_domain', shop)
  if (error) throw new Error('Could not mark the Shopify installation uninstalled.')
}

/** `shop/redact` is the final privacy deletion, not another soft uninstall. */
export async function redactShop(admin: Pick<SupabaseClient, 'from'>, shop: string): Promise<void> {
  const { error } = await admin.from('shopify_installs').delete().eq('shop_domain', shop)
  if (error) throw new Error('Could not redact the Shopify installation.')
}
