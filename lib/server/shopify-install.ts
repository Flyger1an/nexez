import 'server-only'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OfferItem } from '../agent-page'
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
  catalog_sync_pending_at?: string | null
  catalog_sync_attempted_at?: string | null
  catalog_sync_attempts?: number | null
  catalog_sync_error?: string | null
  catalog_sync_topic?: string | null
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
const SHOPIFY_LINK_TOKEN_TTL_MS = 10 * 60 * 1000

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
    .select('shop_domain, owner_id, page_id, scope, uninstalled_at, linked_at, last_synced_at, catalog_sync_pending_at, catalog_sync_attempted_at, catalog_sync_attempts, catalog_sync_error, catalog_sync_topic')
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
    row.link_token_hash = null
    row.link_token_expires_at = null
  }
  // Only in the payload (and therefore ON CONFLICT update) when provided.
  if (input.ownerId !== undefined) row.owner_id = input.ownerId
  if (input.pageId !== undefined) row.page_id = input.pageId
  const { error } = await admin.from('shopify_installs').upsert(row, { onConflict: 'shop_domain' })
  if (error) throw new Error('Could not save the Shopify installation.')
}

/** Exchange an App Bridge ID token for rotating offline credentials. Embedded
 * apps use this instead of a cookie-backed authorization-code callback. */
export async function exchangeShopifySessionToken(
  admin: Pick<SupabaseClient, 'from'>,
  shop: string,
  subjectToken: string,
): Promise<void> {
  const clientId = process.env.SHOPIFY_API_KEY
  const clientSecret = process.env.SHOPIFY_API_SECRET
  if (!clientId || !clientSecret || !subjectToken) throw new Error('Shopify token exchange is not configured.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SHOPIFY_TOKEN_TIMEOUT_MS)
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      expiring: '1',
    })
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Shopify token exchange failed.')
    const json = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      refresh_token_expires_in?: number
      scope?: string
    }
    const accessToken = String(json.access_token || '')
    const refreshToken = String(json.refresh_token || '')
    const expiresIn = Number(json.expires_in || 0)
    const refreshTokenExpiresIn = Number(json.refresh_token_expires_in || 0)
    if (!accessToken || !refreshToken || expiresIn <= 0 || refreshTokenExpiresIn <= 0) {
      throw new Error('Shopify returned incomplete offline credentials.')
    }
    await upsertInstall(admin, {
      shop,
      offlineToken: accessToken,
      refreshToken,
      expiresIn,
      refreshTokenExpiresIn,
      scope: String(json.scope || ''),
    })
  } finally {
    clearTimeout(timer)
  }
}

/** Ensure an embedded app session has a usable offline install. Existing
 * credentials are reused or refreshed; token exchange is the recovery path. */
export async function ensureShopifySessionInstall(
  admin: Pick<SupabaseClient, 'from'>,
  shop: string,
  subjectToken: string,
): Promise<ShopifyInstall> {
  const credentials = await getShopifyInstallCredentialsByShop(admin, shop)
  if (!credentials) await exchangeShopifySessionToken(admin, shop, subjectToken)
  const install = await getInstallByShop(admin, shop)
  if (!install) throw new Error('Could not establish the Shopify installation.')
  return install
}

function hashLinkToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Mint a short-lived, single-use credential for moving from the Shopify iframe
 * into Nexez's top-level account-link flow without third-party cookies. */
export async function issueShopifyLinkToken(
  admin: Pick<SupabaseClient, 'from'>,
  shop: string,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  const now = new Date()
  const { data, error } = await admin
    .from('shopify_installs')
    .update({
      link_token_hash: hashLinkToken(token),
      link_token_expires_at: new Date(now.getTime() + SHOPIFY_LINK_TOKEN_TTL_MS).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('shop_domain', shop)
    .is('uninstalled_at', null)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (error || !data) throw new Error('Could not create the Shopify account-link session.')
  return token
}

/** Consume a link credential exactly once. The compare-and-clear update makes
 * concurrent replays fail after the first successful claimant. */
export async function consumeShopifyLinkToken(
  admin: Pick<SupabaseClient, 'from'>,
  token: string,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null
  const tokenHash = hashLinkToken(token)
  const now = new Date().toISOString()
  const { data: row, error: readError } = await admin
    .from('shopify_installs')
    .select('shop_domain, link_token_expires_at')
    .eq('link_token_hash', tokenHash)
    .is('uninstalled_at', null)
    .maybeSingle<{ shop_domain: string; link_token_expires_at: string | null }>()
  if (readError || !row?.link_token_expires_at || row.link_token_expires_at <= now) return null

  const { data, error } = await admin
    .from('shopify_installs')
    .update({ link_token_hash: null, link_token_expires_at: null, updated_at: now })
    .eq('shop_domain', row.shop_domain)
    .eq('link_token_hash', tokenHash)
    .is('uninstalled_at', null)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (error || !data) return null
  return data.shop_domain
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

async function credentialsFromRow(
  admin: Pick<SupabaseClient, 'from'>,
  row: ShopifyTokenRow,
): Promise<ShopifyInstallCredentials | null> {
  const accessToken = decryptSecret(row.offline_token_encrypted)
  const expires = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : Number.POSITIVE_INFINITY
  if (accessToken && expires > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return { shop: row.shop_domain, accessToken }
  }
  return refreshInstallToken(admin, row)
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

  return credentialsFromRow(admin, data)
}

/** Resolve rotating OAuth credentials for one exact shop. Catalog webhooks use
 * this instead of page lookup so two installed shops can never cross-sync. */
export async function getShopifyInstallCredentialsByShop(
  admin: Pick<SupabaseClient, 'from'>,
  shop: string,
): Promise<ShopifyInstallCredentials | null> {
  const { data, error } = await admin
    .from('shopify_installs')
    .select('shop_domain, owner_id, page_id, scope, uninstalled_at, linked_at, last_synced_at, offline_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at')
    .eq('shop_domain', shop)
    .is('uninstalled_at', null)
    .maybeSingle<ShopifyTokenRow>()
  if (error || !data) return null
  return credentialsFromRow(admin, data)
}

export async function markShopifySynced(
  admin: Pick<SupabaseClient, 'from'>,
  pageId: string,
  at: string,
  options: { shop?: string; clearCatalogSyncState?: boolean } = {},
): Promise<void> {
  const updates: Record<string, unknown> = { last_synced_at: at, updated_at: at }
  if (options.clearCatalogSyncState) {
    updates.catalog_sync_pending_at = null
    updates.catalog_sync_attempted_at = null
    updates.catalog_sync_attempts = 0
    updates.catalog_sync_error = null
  }
  let query = admin
    .from('shopify_installs')
    .update(updates)
    .eq('page_id', pageId)
    .is('uninstalled_at', null)
  if (options.shop) query = query.eq('shop_domain', options.shop)
  const { error } = await query
  if (error) throw new Error('Could not record the Shopify sync time.')
}

function belongsToShop(offer: OfferItem, shop: string): boolean {
  if (offer.source !== 'shopify') return false
  const offerShop = typeof offer.metadata?.shopify_shop === 'string'
    ? offer.metadata.shopify_shop.trim().toLowerCase()
    : ''
  // Legacy Shopify imports predate shop-scoped metadata. The installation's
  // page mapping is the only remaining ownership proof, so remove those too.
  return !offerShop || offerShop === shop.trim().toLowerCase()
}

export async function removeShopifyCatalogFromPage(
  admin: Pick<SupabaseClient, 'from'>,
  pageId: string | null,
  shop: string,
): Promise<void> {
  if (!pageId) return
  const { data: page, error: readError } = await admin
    .from('pages')
    .select('id, services, products, updated_at')
    .eq('id', pageId)
    .maybeSingle<{ id: string; services: OfferItem[] | null; products: OfferItem[] | null; updated_at: string }>()
  if (readError) throw new Error('Could not read the linked listing during Shopify cleanup.')
  if (!page) return

  const services = (page.services ?? []).filter((offer) => !belongsToShop(offer, shop))
  const products = (page.products ?? []).filter((offer) => !belongsToShop(offer, shop))
  if (services.length === (page.services ?? []).length && products.length === (page.products ?? []).length) return

  const { data: written, error: writeError } = await admin
    .from('pages')
    .update({ services, products })
    .eq('id', page.id)
    .eq('updated_at', page.updated_at)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (writeError || !written) {
    throw new Error('Could not remove Shopify catalog data from the linked listing.')
  }
}

/** Mark a shop uninstalled, revoke every live credential/link immediately, and
 * remove its imported offers. owner_id/page_id remain only as service-role
 * cleanup pointers until Shopify sends the final shop/redact webhook. */
export async function markUninstalled(admin: Pick<SupabaseClient, 'from'>, shop: string, at: string): Promise<void> {
  const { data, error } = await admin
    .from('shopify_installs')
    .update({
      uninstalled_at: at,
      offline_token_encrypted: null,
      refresh_token_encrypted: null,
      access_token_expires_at: null,
      refresh_token_expires_at: null,
      linked_at: null,
      last_synced_at: null,
      link_token_hash: null,
      link_token_expires_at: null,
      updated_at: at,
    })
    .eq('shop_domain', shop)
    .select('page_id')
    .maybeSingle<{ page_id: string | null }>()
  if (error) throw new Error('Could not mark the Shopify installation uninstalled.')
  await removeShopifyCatalogFromPage(admin, data?.page_id ?? null, shop)
}

/** `shop/redact` removes any remaining catalog copy before deleting the final
 * service-role-only installation record. Idempotent when uninstall cleanup
 * already removed the offers or the install no longer exists. */
export async function redactShop(admin: Pick<SupabaseClient, 'from'>, shop: string): Promise<void> {
  const { data, error: readError } = await admin
    .from('shopify_installs')
    .select('page_id')
    .eq('shop_domain', shop)
    .maybeSingle<{ page_id: string | null }>()
  if (readError) throw new Error('Could not read the Shopify installation for redaction.')
  await removeShopifyCatalogFromPage(admin, data?.page_id ?? null, shop)
  const { error } = await admin.from('shopify_installs').delete().eq('shop_domain', shop)
  if (error) throw new Error('Could not redact the Shopify installation.')
}
