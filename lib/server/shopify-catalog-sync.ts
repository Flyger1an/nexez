import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureEvent } from '../observability'
import { syncPageIntegration } from './integration-sync'
import { getShopifyInstallCredentialsByShop } from './shopify-install'

export const SHOPIFY_CATALOG_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
] as const

export type ShopifyCatalogTopic = (typeof SHOPIFY_CATALOG_TOPICS)[number]

export function isShopifyCatalogTopic(topic: string): topic is ShopifyCatalogTopic {
  return (SHOPIFY_CATALOG_TOPICS as readonly string[]).includes(topic)
}

type CatalogSyncJob = {
  shop_domain: string
  owner_id: string | null
  page_id: string | null
  catalog_sync_pending_at: string
  catalog_sync_attempted_at: string | null
  catalog_sync_attempts: number | null
}

export type ShopifyCatalogSyncRun = {
  queued: number
  claimed: number
  synced: number
  failed: number
  skipped: number
}

const MAX_RETRY_ATTEMPTS = 5
const CLAIM_STALE_MS = 2 * 60 * 1000

/** Debounce every product webhook into one pending row per installed shop. */
export async function queueShopifyCatalogSync(
  admin: Pick<SupabaseClient, 'from'>,
  shop: string,
  topic: ShopifyCatalogTopic,
  at = new Date().toISOString(),
): Promise<boolean> {
  const { data, error } = await admin
    .from('shopify_installs')
    .update({
      catalog_sync_pending_at: at,
      catalog_sync_attempted_at: null,
      catalog_sync_attempts: 0,
      catalog_sync_error: null,
      catalog_sync_topic: topic,
      updated_at: at,
    })
    .eq('shop_domain', shop)
    .is('uninstalled_at', null)
    .not('page_id', 'is', null)
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (error) throw new Error('Could not queue the Shopify catalog sync.')
  return Boolean(data)
}

async function loadPendingJobs(admin: Pick<SupabaseClient, 'from'>, limit: number): Promise<CatalogSyncJob[]> {
  const { data, error } = await admin
    .from('shopify_installs')
    .select('shop_domain, owner_id, page_id, catalog_sync_pending_at, catalog_sync_attempted_at, catalog_sync_attempts')
    .is('uninstalled_at', null)
    .not('page_id', 'is', null)
    .not('catalog_sync_pending_at', 'is', null)
    .order('catalog_sync_pending_at', { ascending: true })
    .limit(limit)
    .returns<CatalogSyncJob[]>()
  if (error) throw new Error('Could not read pending Shopify catalog syncs.')
  return data ?? []
}

/** Compare-and-swap the pending timestamp and prior claim so overlapping cron
 * runs cannot process the same shop. Stale claims become recoverable after a
 * terminated worker, while a newer webhook resets the claim immediately. */
async function claimJob(
  admin: Pick<SupabaseClient, 'from'>,
  job: CatalogSyncJob,
  attemptedAt: string,
): Promise<boolean> {
  if (job.catalog_sync_attempted_at) {
    const claimedAt = Date.parse(job.catalog_sync_attempted_at)
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < CLAIM_STALE_MS) return false
  }
  const nextAttempts = Math.max(0, Number(job.catalog_sync_attempts) || 0) + 1
  let query = admin
    .from('shopify_installs')
    .update({
      catalog_sync_attempted_at: attemptedAt,
      catalog_sync_attempts: nextAttempts,
      updated_at: attemptedAt,
    })
    .eq('shop_domain', job.shop_domain)
    .eq('catalog_sync_pending_at', job.catalog_sync_pending_at)
    .is('uninstalled_at', null)
  query = job.catalog_sync_attempted_at
    ? query.eq('catalog_sync_attempted_at', job.catalog_sync_attempted_at)
    : query.is('catalog_sync_attempted_at', null)
  const { data, error } = await query
    .select('shop_domain')
    .maybeSingle<{ shop_domain: string }>()
  if (error) throw new Error('Could not claim the Shopify catalog sync.')
  return Boolean(data)
}

async function completeJob(
  admin: Pick<SupabaseClient, 'from'>,
  job: CatalogSyncJob,
  attemptedAt: string,
  completedAt: string,
): Promise<void> {
  // Only clear this exact event and claim. A newer webhook changes both values.
  const { error } = await admin
    .from('shopify_installs')
    .update({
      catalog_sync_pending_at: null,
      catalog_sync_attempts: 0,
      catalog_sync_error: null,
      updated_at: completedAt,
    })
    .eq('shop_domain', job.shop_domain)
    .eq('catalog_sync_pending_at', job.catalog_sync_pending_at)
    .eq('catalog_sync_attempted_at', attemptedAt)
    .is('uninstalled_at', null)
  if (error) throw new Error('Could not complete the Shopify catalog sync.')
}

async function failJob(
  admin: Pick<SupabaseClient, 'from'>,
  job: CatalogSyncJob,
  error: string,
  attemptedAt: string,
  failedAt: string,
  retry: boolean,
): Promise<void> {
  const attempts = Math.max(0, Number(job.catalog_sync_attempts) || 0) + 1
  // A webhook that arrived during processing installed a newer pending timestamp
  // and cleared the claim, so this older failure cannot overwrite it.
  const { error: writeError } = await admin
    .from('shopify_installs')
    .update({
      catalog_sync_pending_at: retry && attempts < MAX_RETRY_ATTEMPTS ? failedAt : null,
      catalog_sync_attempted_at: retry && attempts < MAX_RETRY_ATTEMPTS ? null : attemptedAt,
      catalog_sync_error: error.slice(0, 300),
      updated_at: failedAt,
    })
    .eq('shop_domain', job.shop_domain)
    .eq('catalog_sync_pending_at', job.catalog_sync_pending_at)
    .eq('catalog_sync_attempted_at', attemptedAt)
    .is('uninstalled_at', null)
  if (writeError) throw new Error('Could not record the Shopify catalog sync failure.')
}

/** Process a small bounded batch. Shopify credentials are resolved by the exact
 * webhook shop, never by whichever shop happened to link to the page last. */
export async function processPendingShopifyCatalogSyncs(
  admin: SupabaseClient,
  limit = 4,
): Promise<ShopifyCatalogSyncRun> {
  const jobs = await loadPendingJobs(admin, Math.max(1, Math.min(limit, 10)))
  const run: ShopifyCatalogSyncRun = { queued: jobs.length, claimed: 0, synced: 0, failed: 0, skipped: 0 }

  for (const job of jobs) {
    const attemptedAt = new Date().toISOString()
    if (!(await claimJob(admin, job, attemptedAt))) {
      run.skipped += 1
      continue
    }
    run.claimed += 1

    try {
      if (!job.owner_id || !job.page_id) {
        await failJob(admin, job, 'Shopify installation is not linked to a listing.', attemptedAt, attemptedAt, false)
        run.failed += 1
        continue
      }
      const credentials = await getShopifyInstallCredentialsByShop(admin, job.shop_domain)
      if (!credentials) {
        await failJob(admin, job, 'Reconnect Shopify to resume automatic catalog sync.', attemptedAt, attemptedAt, true)
        run.failed += 1
        continue
      }

      const result = await syncPageIntegration(admin, 'shopify', job.page_id, { shopifyCredentials: credentials })
      const completedAt = new Date().toISOString()
      if (result.ok) {
        await completeJob(admin, job, attemptedAt, completedAt)
        run.synced += 1
      } else {
        await failJob(admin, job, result.error, attemptedAt, completedAt, result.status === 409 || result.status >= 500)
        run.failed += 1
      }
    } catch (error) {
      const failedAt = new Date().toISOString()
      console.error('[shopify-catalog-sync] installation sync failed', {
        shop: job.shop_domain,
        error: error instanceof Error ? error.message : String(error),
      })
      await failJob(
        admin,
        job,
        'Shopify catalog sync hit a temporary problem. Nexez will retry automatically.',
        attemptedAt,
        failedAt,
        true,
      )
      run.failed += 1
    }
  }

  captureEvent('cron.shopify_catalog_sync', run)
  return run
}
