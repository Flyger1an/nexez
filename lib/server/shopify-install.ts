import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptSecret } from './secret-crypto'

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
  input: { shop: string; ownerId?: string | null; pageId?: string | null; offlineToken: string; scope?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {
    shop_domain: input.shop,
    offline_token_encrypted: encryptSecret(input.offlineToken),
    scope: input.scope ?? null,
    uninstalled_at: null,
  }
  // Only in the payload (→ only in the ON CONFLICT update SET) when provided.
  if (input.ownerId !== undefined) row.owner_id = input.ownerId
  if (input.pageId !== undefined) row.page_id = input.pageId
  await admin.from('shopify_installs').upsert(row, { onConflict: 'shop_domain' })
}

/** Mark a shop uninstalled + wipe its token (app/uninstalled + shop/redact). */
export async function markUninstalled(admin: Pick<SupabaseClient, 'from'>, shop: string, at: string): Promise<void> {
  await admin
    .from('shopify_installs')
    .update({ uninstalled_at: at, offline_token_encrypted: null })
    .eq('shop_domain', shop)
}
