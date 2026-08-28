import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { importIntegrationOffers, type IntegrationIngestInput } from './integration-importers'
import { getShopifyCreds, getSquareCreds, getAcuityCreds, integrationCredentialsConfigured } from './page-integration-credentials'
import { getCalendlyCredential } from './calendly-credentials'
import {
  getUsableConnectorCredential,
  isManagedConnectorProvider,
  recordMerchantConnectorSync,
  type OAuthCredential,
  type WooCommerceCredential,
} from './merchant-connectors'
import { fetchCalendlyEventTypeAvailability } from './calendly-write'
import { applyEventTypeAvailability, buildCalendlyNextAvailable, calendlyEventTypeRefs } from '../calendly-availability'
import { mergeProviderOffersAcrossColumns } from '../integration-merge'
import { parseAvailabilityWindows, type OfferItem } from '../agent-page'
import { captureEvent } from '../observability'
import {
  commitShopifyCatalogSync,
  type ShopifyInstallCredentials,
  type ShopifyInstallMapping,
} from './shopify-install'

const HORIZON_DAYS = 7

// Providers that "connect once → stored credential → re-sync without re-entering
// the token". All are per-seller token providers whose creds live encrypted in
// page_secrets. (Stripe is excluded: it's platform-key + Connect, and its prices
// already auto-sync via webhook - there's no per-seller catalog token to store.)
export type SyncProvider = 'calendly' | 'shopify' | 'square' | 'acuity' | 'woocommerce' | 'servicem8'
export const SYNCABLE_PROVIDERS: readonly SyncProvider[] = ['calendly', 'shopify', 'square', 'acuity', 'woocommerce', 'servicem8']
export function isSyncProvider(p: string): p is SyncProvider {
  return (SYNCABLE_PROVIDERS as readonly string[]).includes(p)
}

const PROVIDER_LABEL: Record<SyncProvider, string> = {
  calendly: 'Calendly',
  shopify: 'Shopify',
  square: 'Square',
  acuity: 'Acuity',
  woocommerce: 'WooCommerce',
  servicem8: 'ServiceM8',
}

export type SyncResult =
  | { ok: true; provider: SyncProvider; imported: number; windows: number; availabilitySynced: boolean; note: string | null }
  | { ok: false; status: number; error: string }

/** Build the import input from the page's STORED credentials, or null if the
 *  provider isn't connected for this page. Never takes a token from the caller. */
async function resolveStoredInput(
  admin: SupabaseClient,
  provider: SyncProvider,
  pageId: string,
  options: SyncOptions = {},
): Promise<IntegrationIngestInput | null> {
  if (provider === 'calendly') {
    const credential = await getCalendlyCredential(admin, pageId)
    return credential ? { provider: 'calendly', token: credential.accessToken } : null
  }
  if (provider === 'shopify') {
    if (options.shopifyCredentials) {
      return { provider: 'shopify', shop: options.shopifyCredentials.shop, accessToken: options.shopifyCredentials.accessToken, limit: 250 }
    }
    const creds = await getShopifyCreds(pageId)
    return creds ? { provider: 'shopify', shop: creds.shop, accessToken: creds.token, limit: 250 } : null
  }
  if (provider === 'square') {
    const managed = await getUsableConnectorCredential(admin, pageId, 'square')
    if (managed.ok) return { provider: 'square', accessToken: (managed.credential as OAuthCredential).accessToken }
    const creds = await getSquareCreds(pageId)
    return creds ? { provider: 'square', accessToken: creds.accessToken } : null
  }
  if (provider === 'woocommerce') {
    const managed = await getUsableConnectorCredential(admin, pageId, 'woocommerce')
    return managed.ok ? { provider: 'woocommerce', credentials: managed.credential as WooCommerceCredential } : null
  }
  if (provider === 'servicem8') {
    const managed = await getUsableConnectorCredential(admin, pageId, 'servicem8')
    return managed.ok ? { provider: 'servicem8', accessToken: (managed.credential as OAuthCredential).accessToken } : null
  }
  if (provider === 'acuity') {
    const managed = await getUsableConnectorCredential(admin, pageId, 'acuity')
    if (managed.ok) return { provider: 'acuity', accessToken: (managed.credential as OAuthCredential).accessToken }
    const creds = await getAcuityCreds(pageId)
    return creds ? { provider: 'acuity', userId: creds.userId, apiKey: creds.apiKey } : null
  }
  return null
}

export type SyncOptions = {
  /** Exact installed-app credential. This prevents a worker/session/manual
   * OAuth refresh from falling back to a page's Pro-only manual credential. */
  shopifyCredentials?: ShopifyInstallCredentials
  /** Exact shop -> owner -> listing generation paired with an installed-app
   * credential. Both are required together; installed sync never falls back to
   * page_secrets after the mapping is inspected. */
  shopifyMapping?: ShopifyInstallMapping
  /** Seller-triggered installed-app retries clear retained queue/attention
   * state; a claimed worker keeps ownership of clearing its own queue row. */
  clearShopifyCatalogSyncState?: boolean
  /** Operational source for telemetry. Manual is the default for existing
   * callers and seller-triggered retries. */
  trigger?: 'manual' | 'oauth_callback' | 'background'
}

/**
 * Sync a page's offers (and, for Calendly, availability) from the STORED per-page
 * credential - the shared engine behind both the generic
 * /api/pages/[id]/integrations/[provider]/sync route and the legacy
 * /api/pages/[id]/calendly/sync route. Caller MUST authorize edit access and
 * enforce the integrations entitlement first unless it passes credentials from
 * an owner-verified installed Shopify OAuth connection. The installed Shopify
 * connector is available on every plan; manually stored Shopify credentials and
 * every other premium connector remain plan gated. Dormant without
 * INTEGRATION_SECRET_KEY.
 *
 * The merge only ever manages this provider's own offers (mergeProviderOffers) -
 * a same-named manual offer is never clobbered.
 */
export async function syncPageIntegration(
  admin: SupabaseClient,
  provider: SyncProvider,
  pageId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  if (!integrationCredentialsConfigured()) {
    return { ok: false, status: 503, error: 'Integration credential storage is not configured on this deployment.' }
  }
  if (provider === 'shopify') {
    const hasInstalledCredential = Boolean(options.shopifyCredentials)
    const hasInstalledMapping = Boolean(options.shopifyMapping)
    if (hasInstalledCredential !== hasInstalledMapping) {
      return { ok: false, status: 409, error: 'Reconnect the Shopify app to this listing before syncing.' }
    }
    if (
      options.shopifyCredentials
      && options.shopifyMapping
      && (
        options.shopifyCredentials.shop !== options.shopifyMapping.shop
        || options.shopifyMapping.pageId !== pageId
      )
    ) {
      return { ok: false, status: 409, error: 'The Shopify listing connection changed before sync started.' }
    }
  }
  const input = await resolveStoredInput(admin, provider, pageId, options)
  if (!input) {
    return { ok: false, status: 400, error: `Connect ${PROVIDER_LABEL[provider]} in Settings before syncing.` }
  }

  const fail = async (status: number, error: string): Promise<SyncResult> => {
    if (isManagedConnectorProvider(provider)) {
      await recordMerchantConnectorSync(admin, pageId, provider, { ok: false, error })
    }
    return { ok: false, status, error }
  }

  const imported = await importIntegrationOffers(input)
  if (!imported.ok) {
    return fail(502, imported.error)
  }

  const { data: page } = await admin
    .from('pages')
    .select('id, slug, services, products, next_available, updated_at')
    .eq('id', pageId)
    .maybeSingle<{ id: string; slug: string; services: OfferItem[] | null; products: OfferItem[] | null; next_available: string | null; updated_at: string }>()
  if (!page) return fail(404, 'Listing not found.')

  // Column-aware merge: update a provider offer wherever it already lives
  // (services OR products) and never duplicate across columns - the webhook/cron
  // treat a provider offer as valid in either.
  const shopifyScope = input.provider === 'shopify' ? input.shop : undefined
  const incomingOffers = provider === 'shopify' && options.shopifyMapping
    ? imported.offers.map((offer) => ({
        ...offer,
        metadata: {
          ...(offer.metadata ?? {}),
          shopify_mapping_generation: options.shopifyMapping!.generation,
        },
      }))
    : imported.offers
  const merged = mergeProviderOffersAcrossColumns(page.services ?? [], page.products ?? [], incomingOffers, provider, {
    scope: shopifyScope,
    // A Shopify result can be intentionally capped. Absence is authoritative
    // only after the importer reached the end of the active catalog.
    pruneMissing: provider === 'shopify' && imported.catalogComplete === true,
  })
  let services = merged.services
  let products = merged.products
  const nowIso = new Date().toISOString()
  const update: Record<string, unknown> = {}
  let windows: Array<{ label: string }> = []
  let availabilitySynced = false

  // Calendly-only: use Calendly's actual event-type slots. Calendly applies the
  // owner's timezone, schedule, overrides, buffers, and conflicts before it
  // returns these times; Nexez must not invent generic server-local hours.
  if (provider === 'calendly' && input.provider === 'calendly') {
    const eventTypeAvailability = await fetchCalendlyEventTypeAvailability(
      input.token,
      calendlyEventTypeRefs([...services, ...products]),
      { days: HORIZON_DAYS },
    )
    if (eventTypeAvailability) {
      availabilitySynced = true
      windows = eventTypeAvailability.windows
      services = applyEventTypeAvailability(services, eventTypeAvailability.availabilityByEventType, nowIso)
      products = applyEventTypeAvailability(products, eventTypeAvailability.availabilityByEventType, nowIso)
      // Never stomp a hand-written availability note; only refresh empty / already-Calendly-managed.
      const priorIsManual = parseAvailabilityWindows(page.next_available) === null && Boolean(page.next_available && page.next_available.trim())
      // A partial response with zero slots cannot prove the whole page is sold
      // out. Known positive slots are safe to publish; a complete response can
      // also truthfully publish the empty state.
      if (!priorIsManual && (eventTypeAvailability.complete || windows.length > 0)) {
        const next = buildCalendlyNextAvailable(windows, HORIZON_DAYS)
        if (next !== page.next_available) update.next_available = next
      }
    }
  }

  update.services = services
  update.products = products
  if (provider === 'shopify' && options.shopifyMapping) {
    let commit: Awaited<ReturnType<typeof commitShopifyCatalogSync>>
    try {
      commit = await commitShopifyCatalogSync(admin, {
        mapping: options.shopifyMapping,
        expectedPageUpdatedAt: page.updated_at,
        services,
        products,
        syncedAt: nowIso,
        clearCatalogSyncState: options.clearShopifyCatalogSyncState ?? false,
      })
    } catch {
      return fail(500, 'Could not save the synced Shopify catalog.')
    }
    if (commit === 'mapping_stale') {
      return fail(409, 'The Shopify listing connection changed during sync. Retry from the currently linked listing.')
    }
    if (commit === 'page_conflict') {
      return fail(409, 'This listing changed during the sync. Nexez will retry with the latest version.')
    }
  } else {
    const { data: written, error: writeErr } = await admin
      .from('pages')
      .update(update)
      .eq('id', pageId)
      .eq('updated_at', page.updated_at)
      .select('id')
      .maybeSingle<{ id: string }>()
    if (writeErr) return fail(500, 'Could not save the synced offers.')
    if (!written) {
      return fail(409, 'This listing changed during the sync. Nexez will retry with the latest version.')
    }
  }

  // Advance the Calendly rotation cursor so the background cron doesn't immediately re-run it.
  if (provider === 'calendly') {
    await admin.from('page_secrets').update({ calendly_synced_at: nowIso }).eq('page_id', pageId)
  }

  if (isManagedConnectorProvider(provider)) {
    await recordMerchantConnectorSync(admin, pageId, provider, {
      ok: true,
      metadata: imported.connectionMetadata,
    })
  }

  captureEvent('integration.manual_sync', {
    provider,
    slug: page.slug,
    imported: imported.offers.length,
    windows: windows.length,
    trigger: options.trigger ?? 'manual',
  })
  return { ok: true, provider, imported: imported.offers.length, windows: windows.length, availabilitySynced, note: imported.note }
}
