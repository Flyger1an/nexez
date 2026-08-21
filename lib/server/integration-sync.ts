import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { importIntegrationOffers, type IntegrationIngestInput } from './integration-importers'
import { getCalendlyPat, getShopifyCreds, getSquareCreds, getAcuityCreds, integrationCredentialsConfigured } from './page-integration-credentials'
import { fetchCalendlyEventTypeAvailability } from './calendly-write'
import { applyEventTypeAvailability, buildCalendlyNextAvailable, calendlyEventTypeRefs } from '../calendly-availability'
import { mergeProviderOffersAcrossColumns } from '../integration-merge'
import { parseAvailabilityWindows, type OfferItem } from '../agent-page'
import { captureEvent } from '../observability'
import { getShopifyInstallCredentials, markShopifySynced, type ShopifyInstallCredentials } from './shopify-install'

const HORIZON_DAYS = 7

// Providers that "connect once → stored credential → re-sync without re-entering
// the token". All are per-seller token providers whose creds live encrypted in
// page_secrets. (Stripe is excluded: it's platform-key + Connect, and its prices
// already auto-sync via webhook — there's no per-seller catalog token to store.)
export type SyncProvider = 'calendly' | 'shopify' | 'square' | 'acuity'
export const SYNCABLE_PROVIDERS: readonly SyncProvider[] = ['calendly', 'shopify', 'square', 'acuity']
export function isSyncProvider(p: string): p is SyncProvider {
  return (SYNCABLE_PROVIDERS as readonly string[]).includes(p)
}

const PROVIDER_LABEL: Record<SyncProvider, string> = { calendly: 'Calendly', shopify: 'Shopify', square: 'Square', acuity: 'Acuity' }

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
    const token = await getCalendlyPat(pageId)
    return token ? { provider: 'calendly', token } : null
  }
  if (provider === 'shopify') {
    if (options.shopifyCredentials) {
      return { provider: 'shopify', shop: options.shopifyCredentials.shop, accessToken: options.shopifyCredentials.accessToken, limit: 250 }
    }
    const installed = await getShopifyInstallCredentials(admin, pageId)
    if (installed) return { provider: 'shopify', shop: installed.shop, accessToken: installed.accessToken, limit: 250 }
    const creds = await getShopifyCreds(pageId)
    return creds ? { provider: 'shopify', shop: creds.shop, accessToken: creds.token, limit: 250 } : null
  }
  if (provider === 'square') {
    const creds = await getSquareCreds(pageId)
    return creds ? { provider: 'square', accessToken: creds.accessToken } : null
  }
  const creds = await getAcuityCreds(pageId)
  return creds ? { provider: 'acuity', userId: creds.userId, apiKey: creds.apiKey } : null
}

export type SyncOptions = {
  /** Internal webhook worker override. User-facing syncs resolve the installed
   * shop from the listing as before. */
  shopifyCredentials?: ShopifyInstallCredentials
}

/**
 * Sync a page's offers (and, for Calendly, availability) from the STORED per-page
 * credential — the shared engine behind both the generic
 * /api/pages/[id]/integrations/[provider]/sync route and the legacy
 * /api/pages/[id]/calendly/sync route. Caller MUST authorize edit access and
 * enforce the provider entitlement first. The installed Shopify app is a free
 * connector; manually stored credentials and other providers remain plan gated.
 * Dormant without INTEGRATION_SECRET_KEY.
 *
 * The merge only ever manages this provider's own offers (mergeProviderOffers) —
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
  const input = await resolveStoredInput(admin, provider, pageId, options)
  if (!input) {
    return { ok: false, status: 400, error: `Connect ${PROVIDER_LABEL[provider]} in Settings before syncing.` }
  }

  const imported = await importIntegrationOffers(input)
  if (!imported.ok) return { ok: false, status: 502, error: imported.error }

  const { data: page } = await admin
    .from('pages')
    .select('id, slug, services, products, next_available, updated_at')
    .eq('id', pageId)
    .maybeSingle<{ id: string; slug: string; services: OfferItem[] | null; products: OfferItem[] | null; next_available: string | null; updated_at: string }>()
  if (!page) return { ok: false, status: 404, error: 'Page not found.' }

  // Column-aware merge: update a provider offer wherever it already lives
  // (services OR products) and never duplicate across columns — the webhook/cron
  // treat a provider offer as valid in either.
  const shopifyScope = input.provider === 'shopify' ? input.shop : undefined
  const merged = mergeProviderOffersAcrossColumns(page.services ?? [], page.products ?? [], imported.offers, provider, {
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
  const { data: written, error: writeErr } = await admin
    .from('pages')
    .update(update)
    .eq('id', pageId)
    .eq('updated_at', page.updated_at)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (writeErr) return { ok: false, status: 500, error: 'Could not save the synced offers.' }
  if (!written) {
    return { ok: false, status: 409, error: 'This page changed during the sync. Nexez will retry with the latest version.' }
  }

  // Advance the Calendly rotation cursor so the background cron doesn't immediately re-run it.
  if (provider === 'calendly') {
    await admin.from('page_secrets').update({ calendly_synced_at: nowIso }).eq('page_id', pageId)
  } else if (provider === 'shopify') {
    try {
      await markShopifySynced(admin, pageId, nowIso, {
        shop: input.provider === 'shopify' ? input.shop : undefined,
        // A successful seller-triggered retry clears stale attention state. The
        // background worker owns its claim and clears it atomically afterward.
        clearCatalogSyncState: !options.shopifyCredentials,
      })
    } catch {
      // The catalog write succeeded; a stale health timestamp should not turn a
      // successful merchant sync into an error.
    }
  }

  captureEvent('integration.manual_sync', { provider, slug: page.slug, imported: imported.offers.length, windows: windows.length })
  return { ok: true, provider, imported: imported.offers.length, windows: windows.length, availabilitySynced, note: imported.note }
}
