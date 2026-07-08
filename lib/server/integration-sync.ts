import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { importIntegrationOffers, type IntegrationIngestInput } from './integration-importers'
import { getCalendlyPat, getShopifyCreds, integrationCredentialsConfigured } from './page-integration-credentials'
import { fetchCalendlyBusy } from './calendly-write'
import { deriveAvailabilityWindows } from '../integrations'
import { applyOfferAvailability, buildCalendlyNextAvailable } from '../calendly-availability'
import { mergeProviderOffersAcrossColumns } from '../integration-merge'
import { parseAvailabilityWindows, type OfferItem } from '../agent-page'
import { captureEvent } from '../observability'

const HORIZON_DAYS = 7

// Providers that "connect once → stored credential → re-sync without re-entering
// the token". All are per-seller token providers whose creds live encrypted in
// page_secrets. (Stripe is excluded: it's platform-key + Connect, and its prices
// already auto-sync via webhook — there's no per-seller catalog token to store.)
export type SyncProvider = 'calendly' | 'shopify'
export const SYNCABLE_PROVIDERS: readonly SyncProvider[] = ['calendly', 'shopify']
export function isSyncProvider(p: string): p is SyncProvider {
  return (SYNCABLE_PROVIDERS as readonly string[]).includes(p)
}

const PROVIDER_LABEL: Record<SyncProvider, string> = { calendly: 'Calendly', shopify: 'Shopify' }

export type SyncResult =
  | { ok: true; provider: SyncProvider; imported: number; windows: number; availabilitySynced: boolean; note: string | null }
  | { ok: false; status: number; error: string }

/** Build the import input from the page's STORED credentials, or null if the
 *  provider isn't connected for this page. Never takes a token from the caller. */
async function resolveStoredInput(provider: SyncProvider, pageId: string): Promise<IntegrationIngestInput | null> {
  if (provider === 'calendly') {
    const token = await getCalendlyPat(pageId)
    return token ? { provider: 'calendly', token } : null
  }
  const creds = await getShopifyCreds(pageId)
  return creds ? { provider: 'shopify', shop: creds.shop, accessToken: creds.token } : null
}

/**
 * Sync a page's offers (and, for Calendly, availability) from the STORED per-page
 * credential — the shared engine behind both the generic
 * /api/pages/[id]/integrations/[provider]/sync route and the legacy
 * /api/pages/[id]/calendly/sync route. Caller MUST authorize edit access + Pro
 * first (via gateIntegrationImport). Dormant without INTEGRATION_SECRET_KEY.
 *
 * The merge only ever manages this provider's own offers (mergeProviderOffers) —
 * a same-named manual offer is never clobbered.
 */
export async function syncPageIntegration(admin: SupabaseClient, provider: SyncProvider, pageId: string): Promise<SyncResult> {
  if (!integrationCredentialsConfigured()) {
    return { ok: false, status: 503, error: 'Integration credential storage is not configured on this deployment.' }
  }
  const input = await resolveStoredInput(provider, pageId)
  if (!input) {
    return { ok: false, status: 400, error: `Connect ${PROVIDER_LABEL[provider]} in Settings before syncing.` }
  }

  const imported = await importIntegrationOffers(input)
  if (!imported.ok) return { ok: false, status: 502, error: imported.error }

  const { data: page } = await admin
    .from('pages')
    .select('id, slug, services, products, next_available')
    .eq('id', pageId)
    .maybeSingle<{ id: string; slug: string; services: OfferItem[] | null; products: OfferItem[] | null; next_available: string | null }>()
  if (!page) return { ok: false, status: 404, error: 'Page not found.' }

  // Column-aware merge: update a provider offer wherever it already lives
  // (services OR products) and never duplicate across columns — the webhook/cron
  // treat a provider offer as valid in either.
  const merged = mergeProviderOffersAcrossColumns(page.services ?? [], page.products ?? [], imported.offers, provider)
  let services = merged.services
  let products = merged.products
  const nowIso = new Date().toISOString()
  const update: Record<string, unknown> = {}
  let windows: Array<{ label: string }> = []
  let availabilitySynced = false

  // Calendly-only: refresh availability from real busy-times (mirrors the cron),
  // across BOTH columns since a Calendly offer can live in either.
  if (provider === 'calendly' && input.provider === 'calendly') {
    const busy = await fetchCalendlyBusy(input.token, { days: HORIZON_DAYS })
    if (busy) {
      availabilitySynced = true
      windows = deriveAvailabilityWindows(busy, { days: HORIZON_DAYS })
      const availability = windows.length ? 'available' : 'sold_out'
      for (let i = 0; i < services.length; i++) {
        if (services[i]!.source !== 'calendly') continue
        const applied = applyOfferAvailability(services, i, availability, nowIso)
        if (applied.changed) services = applied.offers
      }
      for (let i = 0; i < products.length; i++) {
        if (products[i]!.source !== 'calendly') continue
        const applied = applyOfferAvailability(products, i, availability, nowIso)
        if (applied.changed) products = applied.offers
      }
      // Never stomp a hand-written availability note; only refresh empty / already-Calendly-managed.
      const priorIsManual = parseAvailabilityWindows(page.next_available) === null && Boolean(page.next_available && page.next_available.trim())
      if (!priorIsManual) {
        const next = buildCalendlyNextAvailable(windows, HORIZON_DAYS)
        if (next !== page.next_available) update.next_available = next
      }
    }
  }

  update.services = services
  update.products = products
  const { error: writeErr } = await admin.from('pages').update(update).eq('id', pageId)
  if (writeErr) return { ok: false, status: 500, error: 'Could not save the synced offers.' }

  // Advance the Calendly rotation cursor so the background cron doesn't immediately re-run it.
  if (provider === 'calendly') {
    await admin.from('page_secrets').update({ calendly_synced_at: nowIso }).eq('page_id', pageId)
  }

  captureEvent('integration.manual_sync', { provider, slug: page.slug, imported: imported.offers.length, windows: windows.length })
  return { ok: true, provider, imported: imported.offers.length, windows: windows.length, availabilitySynced, note: imported.note }
}
