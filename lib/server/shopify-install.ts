import 'server-only'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OfferItem } from '../agent-page'
import { decryptSecret, encryptSecret } from './secret-crypto'

/**
 * The shop→page mapping for Shopify installs. A Shopify install is keyed by shop
 * domain (an OAuth grant per store), whereas Nexez listings are page-id keyed -
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
  mapping_generation?: number
  catalog_generation?: number | null
  mapping_transition_token?: string | null
  mapping_transition_kind?: ShopifyMappingChangeKind | null
  mapping_transition_started_at?: string | null
  mapping_transition_owner_id?: string | null
  mapping_transition_page_id?: string | null
  shop_gid?: string | null
  channel_id?: string | null
  channel_handle?: string | null
  channel_specification_handle?: string | null
  channel_connected_at?: string | null
  shopify_plan_handle?: string | null
  shopify_billing_status?: string | null
  shopify_billing_verified_at?: string | null
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

export type ShopifyInstallMapping = {
  shop: string
  ownerId: string
  pageId: string
  generation: number
}

export type ShopifyMappingChangeKind = 'relink' | 'owner_transfer' | 'uninstall' | 'redact'

export type ShopifyMappingLease = {
  shop: string
  token: string
  kind: ShopifyMappingChangeKind
  generation: number
  catalogGeneration: number | null
  ownerId: string | null
  pageId: string | null
}

export class ShopifyMappingChangeError extends Error {
  constructor(readonly reason: string) {
    super(`Shopify mapping change failed: ${reason}`)
    this.name = 'ShopifyMappingChangeError'
  }
}

const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000
const SHOPIFY_TOKEN_TIMEOUT_MS = 10_000
const SHOPIFY_LINK_TOKEN_TTL_MS = 10 * 60 * 1000
const INSTALL_SELECT = 'shop_domain, owner_id, page_id, scope, uninstalled_at, linked_at, last_synced_at, catalog_sync_pending_at, catalog_sync_attempted_at, catalog_sync_attempts, catalog_sync_error, catalog_sync_topic, mapping_generation, catalog_generation, mapping_transition_token, mapping_transition_kind, mapping_transition_started_at, mapping_transition_owner_id, mapping_transition_page_id, shop_gid, channel_id, channel_handle, channel_specification_handle, channel_connected_at, shopify_plan_handle, shopify_billing_status, shopify_billing_verified_at'
const TOKEN_SELECT = `${INSTALL_SELECT}, offline_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at`

function clearedMappingTransition() {
  return {
    mapping_transition_token: null,
    mapping_transition_kind: null,
    mapping_transition_started_at: null,
    mapping_transition_owner_id: null,
    mapping_transition_page_id: null,
  }
}

function positiveGeneration(value: unknown): number | null {
  const generation = Number(value)
  return Number.isSafeInteger(generation) && generation > 0 ? generation : null
}

export function activeShopifyInstallMapping(install: ShopifyInstall): ShopifyInstallMapping | null {
  const generation = positiveGeneration(install.mapping_generation)
  if (
    !install.owner_id
    || !install.page_id
    || !generation
    || install.uninstalled_at
    || install.mapping_transition_token
  ) return null
  return {
    shop: install.shop_domain,
    ownerId: install.owner_id,
    pageId: install.page_id,
    generation,
  }
}

export async function beginShopifyMappingChange(
  admin: Pick<SupabaseClient, 'rpc'>,
  input: {
    shop: string
    kind: ShopifyMappingChangeKind
    targetOwnerId?: string | null
    targetPageId?: string | null
    at?: string
    token?: string
  },
): Promise<ShopifyMappingLease | null> {
  const token = input.token ?? crypto.randomUUID()
  const { data, error } = await admin.rpc('nz_begin_shopify_mapping_change', {
    p_shop: input.shop,
    p_lease: token,
    p_kind: input.kind,
    p_target_owner_id: input.targetOwnerId ?? null,
    p_target_page_id: input.targetPageId ?? null,
    p_at: input.at ?? new Date().toISOString(),
  })
  if (error) throw new ShopifyMappingChangeError('storage_failed')
  const result = data as {
    status?: unknown
    generation?: unknown
    catalogGeneration?: unknown
    ownerId?: unknown
    pageId?: unknown
  } | null
  const status = typeof result?.status === 'string' ? result.status : 'invalid_response'
  if (status === 'missing') return null
  if (status !== 'begun') throw new ShopifyMappingChangeError(status)
  const generation = positiveGeneration(result?.generation)
  if (!generation) throw new ShopifyMappingChangeError('invalid_generation')
  return {
    shop: input.shop,
    token,
    kind: input.kind,
    generation,
    catalogGeneration: positiveGeneration(result?.catalogGeneration),
    ownerId: typeof result?.ownerId === 'string' ? result.ownerId : null,
    pageId: typeof result?.pageId === 'string' ? result.pageId : null,
  }
}

export async function abortShopifyMappingChange(
  admin: Pick<SupabaseClient, 'rpc'>,
  lease: Pick<ShopifyMappingLease, 'shop' | 'token'>,
  at = new Date().toISOString(),
): Promise<boolean> {
  const { data, error } = await admin.rpc('nz_abort_shopify_mapping_change', {
    p_shop: lease.shop,
    p_lease: lease.token,
    p_at: at,
  })
  if (error) throw new ShopifyMappingChangeError('abort_failed')
  return data === true
}

async function abortMappingChangeQuietly(
  admin: Pick<SupabaseClient, 'rpc'>,
  lease: Pick<ShopifyMappingLease, 'shop' | 'token'>,
): Promise<void> {
  try {
    await abortShopifyMappingChange(admin, lease)
  } catch {
    // Preserve the original lifecycle error. A stale lease is recoverable by a
    // later lifecycle retry after the database-enforced lease timeout.
  }
}

export async function commitShopifyCatalogSync(
  admin: Pick<SupabaseClient, 'rpc'>,
  input: {
    mapping: ShopifyInstallMapping
    expectedPageUpdatedAt: string
    services: OfferItem[]
    products: OfferItem[]
    syncedAt: string
    clearCatalogSyncState: boolean
  },
): Promise<'written' | 'mapping_stale' | 'page_conflict'> {
  const { data, error } = await admin.rpc('nz_commit_shopify_catalog_sync', {
    p_shop: input.mapping.shop,
    p_owner_id: input.mapping.ownerId,
    p_page_id: input.mapping.pageId,
    p_mapping_generation: input.mapping.generation,
    p_expected_page_updated_at: input.expectedPageUpdatedAt,
    p_services: input.services,
    p_products: input.products,
    p_synced_at: input.syncedAt,
    p_clear_catalog_sync_state: input.clearCatalogSyncState,
  })
  if (error) throw new Error('Could not save the synced Shopify catalog.')
  if (data === 'written' || data === 'mapping_stale' || data === 'page_conflict') return data
  throw new Error('Shopify returned an invalid catalog commit result.')
}

/** Activate a relink only when the caller still owns the exact lease returned by
 * beginShopifyMappingChange. Catalog cleanup must complete before calling this
 * function because this is the point where the old page pointer is replaced. */
export async function finishShopifyRelink(
  admin: Pick<SupabaseClient, 'from'>,
  input: {
    lease: ShopifyMappingLease
    ownerId: string
    pageId: string
    at?: string
  },
): Promise<ShopifyInstallMapping> {
  if (input.lease.kind !== 'relink') throw new ShopifyMappingChangeError('invalid_lease_kind')
  const at = input.at ?? new Date().toISOString()
  const nextGeneration = input.lease.generation + 1
  const { data, error } = await admin
    .from('shopify_installs')
    .update({
      owner_id: input.ownerId,
      page_id: input.pageId,
      linked_at: at,
      last_synced_at: null,
      mapping_generation: nextGeneration,
      catalog_generation: null,
      ...clearedMappingTransition(),
      updated_at: at,
    })
    .eq('shop_domain', input.lease.shop)
    .eq('mapping_transition_token', input.lease.token)
    .eq('mapping_generation', input.lease.generation)
    .is('uninstalled_at', null)
    .select('shop_domain, owner_id, page_id, mapping_generation, catalog_generation, uninstalled_at, mapping_transition_token')
    .maybeSingle<ShopifyInstall>()
  if (error) {
    const reason = (error as { code?: string }).code === '23505' ? 'target_conflict' : 'storage_failed'
    throw new ShopifyMappingChangeError(reason)
  }
  const mapping = data ? activeShopifyInstallMapping(data) : null
  if (!mapping || mapping.ownerId !== input.ownerId || mapping.pageId !== input.pageId) {
    throw new ShopifyMappingChangeError('lease_lost')
  }
  return mapping
}

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
    .select(INSTALL_SELECT)
    .eq('shop_domain', shop)
    .is('uninstalled_at', null)
    .maybeSingle()
  return (data as ShopifyInstall) ?? null
}

/** Latest active OAuth install linked to one listing, without credential
 * material. Use this metadata check before deciding whether a seller-triggered
 * sync belongs to the all-plan installed-app path or the Pro-gated manual
 * credential path. */
export async function getInstallByPage(
  admin: Pick<SupabaseClient, 'from'>,
  pageId: string,
): Promise<ShopifyInstall | null> {
  const { data, error } = await admin
    .from('shopify_installs')
    .select(INSTALL_SELECT)
    .eq('page_id', pageId)
    .is('uninstalled_at', null)
    .order('linked_at', { ascending: false })
    .limit(1)
    .maybeSingle<ShopifyInstall>()
  if (error) throw new Error('Could not inspect the Shopify installation for this listing.')
  return data ?? null
}

/**
 * Upsert an install, encrypting the offline token at rest. owner_id / page_id
 * (the link to a Nexez listing, set in a later step) are only written when
 * EXPLICITLY provided - so a re-auth (the OAuth callback refreshing the token
 * without them) preserves an existing shop→listing link instead of nulling it.
 */
export async function upsertInstall(
  admin: Pick<SupabaseClient, 'from' | 'rpc'>,
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
    .select('owner_id, page_id, uninstalled_at, mapping_generation, catalog_generation, mapping_transition_token')
    .eq('shop_domain', input.shop)
    .maybeSingle<{
      owner_id: string | null
      page_id: string | null
      uninstalled_at: string | null
      mapping_generation: number
      catalog_generation: number | null
      mapping_transition_token: string | null
    }>()
  if (readError) throw new Error('Could not read the Shopify installation.')

  const ownerChanged = Boolean(
    existing && input.ownerId !== undefined && input.ownerId !== existing.owner_id,
  )
  const mustRelink = Boolean(existing && (existing.uninstalled_at || ownerChanged))
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    offline_token_encrypted: encryptRequired(input.offlineToken),
    refresh_token_encrypted: encryptRequired(input.refreshToken),
    access_token_expires_at: expiresAt(input.expiresIn),
    refresh_token_expires_at: expiresAt(input.refreshTokenExpiresIn),
    scope: input.scope ?? null,
    uninstalled_at: null,
    updated_at: now,
  }

  if (!existing) {
    const { error } = await admin.from('shopify_installs').insert({
      shop_domain: input.shop,
      owner_id: input.ownerId ?? null,
      page_id: input.pageId ?? null,
      ...row,
    })
    if (error) throw new Error('Could not save the Shopify installation.')
    return
  }

  if (mustRelink) {
    let lease: ShopifyMappingLease | null = null
    try {
      lease = await beginShopifyMappingChange(admin, {
        shop: input.shop,
        kind: 'owner_transfer',
        targetOwnerId: input.ownerId ?? null,
        at: now,
      })
      if (!lease) throw new ShopifyMappingChangeError('missing')

      await removeShopifyCatalogFromPage(
        admin,
        lease.pageId,
        input.shop,
        lease.catalogGeneration,
      )

      // A transferred or reinstalled shop must be explicitly linked again.
      // Never carry the previous owner's page pointer across the OAuth grant.
      const { data, error } = await admin
        .from('shopify_installs')
        .update({
          ...row,
          owner_id: input.ownerId ?? null,
          page_id: null,
          linked_at: null,
          last_synced_at: null,
          mapping_generation: lease.generation + 1,
          catalog_generation: null,
          ...clearedMappingTransition(),
        })
        .eq('shop_domain', input.shop)
        .eq('mapping_generation', lease.generation)
        .eq('mapping_transition_token', lease.token)
        .select('shop_domain')
        .maybeSingle<{ shop_domain: string }>()
      if (error || !data) throw new ShopifyMappingChangeError('lease_lost')
      return
    } catch (error) {
      if (lease) await abortMappingChangeQuietly(admin, lease)
      throw error
    }
  }

  if (input.ownerId !== undefined) row.owner_id = input.ownerId
  if (input.pageId !== undefined) row.page_id = input.pageId
  const { data, error } = await admin
    .from('shopify_installs')
    .update(row)
    .eq('shop_domain', input.shop)
    .eq('mapping_generation', existing.mapping_generation)
    .is('mapping_transition_token', null)
    .is('uninstalled_at', null)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (error || !data) throw new Error('Could not save the Shopify installation.')
}

/** Exchange an App Bridge ID token for rotating offline credentials. Embedded
 * apps use this instead of a cookie-backed authorization-code callback. */
export async function exchangeShopifySessionToken(
  admin: Pick<SupabaseClient, 'from' | 'rpc'>,
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
  admin: Pick<SupabaseClient, 'from' | 'rpc'>,
  shop: string,
  subjectToken: string,
): Promise<ShopifyInstall> {
  const current = await getInstallByShop(admin, shop)
  if (current?.mapping_transition_token) return current
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
    .is('mapping_transition_token', null)
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
    .is('mapping_transition_token', null)
    .maybeSingle<{ shop_domain: string; link_token_expires_at: string | null }>()
  if (readError || !row?.link_token_expires_at || row.link_token_expires_at <= now) return null

  const { data, error } = await admin
    .from('shopify_installs')
    .update({ link_token_hash: null, link_token_expires_at: null, updated_at: now })
    .eq('shop_domain', row.shop_domain)
    .eq('link_token_hash', tokenHash)
    .is('uninstalled_at', null)
    .is('mapping_transition_token', null)
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
    const { data, error } = await admin
      .from('shopify_installs')
      .update(update)
      .eq('shop_domain', row.shop_domain)
      .eq('mapping_generation', row.mapping_generation)
      .is('mapping_transition_token', null)
      .is('uninstalled_at', null)
      .select('shop_domain')
      .maybeSingle<{ shop_domain: string }>()
    if (error || !data) return null
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
  if (row.mapping_transition_token || !positiveGeneration(row.mapping_generation)) return null
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
    .select(TOKEN_SELECT)
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
    .select(TOKEN_SELECT)
    .eq('shop_domain', shop)
    .is('uninstalled_at', null)
    .maybeSingle<ShopifyTokenRow>()
  if (error || !data) return null
  return credentialsFromRow(admin, data)
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

/** Fence application-level catalog cleanup to the generation that existed when
 * its mapping lease began. A stale cleanup can therefore never match offers
 * written after a newer lease took over, even if the shop maps back to the same
 * page. Null is the one-time legacy generation and matches only untagged data. */
export function isShopifyCatalogOfferForGeneration(
  offer: OfferItem,
  shop: string,
  catalogGeneration: number | null,
): boolean {
  if (!belongsToShop(offer, shop)) return false
  const offerGeneration = positiveGeneration(offer.metadata?.shopify_mapping_generation)
  return catalogGeneration === null ? offerGeneration === null : offerGeneration === catalogGeneration
}

export async function removeShopifyCatalogFromPage(
  admin: Pick<SupabaseClient, 'from'>,
  pageId: string | null,
  shop: string,
  catalogGeneration: number | null,
): Promise<void> {
  if (!pageId) return
  const { data: page, error: readError } = await admin
    .from('pages')
    .select('id, services, products, updated_at')
    .eq('id', pageId)
    .maybeSingle<{ id: string; services: OfferItem[] | null; products: OfferItem[] | null; updated_at: string }>()
  if (readError) throw new Error('Could not read the linked listing during Shopify cleanup.')
  if (!page) return

  const services = (page.services ?? []).filter(
    (offer) => !isShopifyCatalogOfferForGeneration(offer, shop, catalogGeneration),
  )
  const products = (page.products ?? []).filter(
    (offer) => !isShopifyCatalogOfferForGeneration(offer, shop, catalogGeneration),
  )
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
export async function markUninstalled(
  admin: Pick<SupabaseClient, 'from' | 'rpc'>,
  shop: string,
  at: string,
): Promise<void> {
  const lease = await beginShopifyMappingChange(admin, { shop, kind: 'uninstall', at })
  if (!lease) return

  // Revocation is the irreversible boundary. If it fails, restoring the prior
  // active mapping is safe. Once it succeeds, never abort: a retained lease and
  // pointer keep credentials closed while a Shopify retry finishes cleanup.
  const { data: revoked, error: revokeError } = await admin
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
    .eq('mapping_generation', lease.generation)
    .eq('mapping_transition_token', lease.token)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (revokeError || !revoked) {
    await abortMappingChangeQuietly(admin, lease)
    throw new Error('Could not mark the Shopify installation uninstalled.')
  }

  await removeShopifyCatalogFromPage(admin, lease.pageId, shop, lease.catalogGeneration)

  const finishedAt = new Date().toISOString()
  const { data: finished, error: finishError } = await admin
    .from('shopify_installs')
    .update({
      mapping_generation: lease.generation + 1,
      catalog_generation: null,
      ...clearedMappingTransition(),
      updated_at: finishedAt,
    })
    .eq('shop_domain', shop)
    .eq('mapping_generation', lease.generation)
    .eq('mapping_transition_token', lease.token)
    .not('uninstalled_at', 'is', null)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (finishError || !finished) {
    throw new Error('Could not finish Shopify uninstall cleanup.')
  }
}

/** `shop/redact` removes any remaining catalog copy before deleting the final
 * service-role-only installation record. Idempotent when uninstall cleanup
 * already removed the offers or the install no longer exists. */
export async function redactShop(
  admin: Pick<SupabaseClient, 'from' | 'rpc'>,
  shop: string,
): Promise<void> {
  const at = new Date().toISOString()
  const lease = await beginShopifyMappingChange(admin, { shop, kind: 'redact', at })
  if (!lease) return

  const { data: revoked, error: revokeError } = await admin
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
    .eq('mapping_generation', lease.generation)
    .eq('mapping_transition_token', lease.token)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (revokeError || !revoked) {
    await abortMappingChangeQuietly(admin, lease)
    throw new Error('Could not revoke the Shopify installation for redaction.')
  }

  await removeShopifyCatalogFromPage(admin, lease.pageId, shop, lease.catalogGeneration)
  const { data: deleted, error } = await admin
    .from('shopify_installs')
    .delete()
    .eq('shop_domain', shop)
    .eq('mapping_generation', lease.generation)
    .eq('mapping_transition_token', lease.token)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (error || !deleted) throw new Error('Could not redact the Shopify installation.')
}
