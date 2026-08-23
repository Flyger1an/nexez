import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { decryptSecret, encryptSecret, hasSecretCryptoKey } from './secret-crypto'

// Per-page stored third-party credentials (currently: the Calendly PAT that the
// future write-side calendar blocking will use). Always service-role: the
// ciphertext column is not readable by authenticated sessions (column grants),
// and the raw token is never returned to any client - the seller only ever sees
// a "connected" boolean. Dormant when the encryption key or admin env is absent.

/** True when this deployment can store/read encrypted credentials at all. */
export function integrationCredentialsConfigured(): boolean {
  return hasSupabaseAdminEnv() && hasSecretCryptoKey()
}

/**
 * Encrypt + persist a Calendly PAT for a page. Returns 'saved', 'cleared'
 * (empty input clears the stored token), or 'unconfigured' (no key/admin env).
 * Caller MUST authorize edit access to the page first.
 */
export async function saveCalendlyPat(pageId: string, ownerId: string, rawPat: string): Promise<'saved' | 'cleared' | 'unconfigured'> {
  if (!hasSupabaseAdminEnv()) return 'unconfigured'
  const trimmed = rawPat.trim()
  if (!trimmed) {
    const admin = createAdminClient()
    await admin
      .from('page_secrets')
      .upsert({ page_id: pageId, owner_id: ownerId, calendly_pat_encrypted: null, updated_at: new Date().toISOString() }, { onConflict: 'page_id' })
    return 'cleared'
  }
  const encrypted = encryptSecret(trimmed)
  if (!encrypted) return 'unconfigured' // no crypto key → can't store safely
  const admin = createAdminClient()
  const { error } = await admin
    .from('page_secrets')
    .upsert({ page_id: pageId, owner_id: ownerId, calendly_pat_encrypted: encrypted, updated_at: new Date().toISOString() }, { onConflict: 'page_id' })
  return error ? 'unconfigured' : 'saved'
}

/** Decrypt the stored Calendly PAT for a page (service-role), or null if none /
 *  unconfigured / undecryptable. The ONLY place the raw token is materialized. */
export async function getCalendlyPat(pageId: string): Promise<string | null> {
  if (!integrationCredentialsConfigured()) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('page_secrets')
    .select('calendly_pat_encrypted')
    .eq('page_id', pageId)
    .maybeSingle<{ calendly_pat_encrypted: string | null }>()
  return decryptSecret(data?.calendly_pat_encrypted ?? null)
}

/** Whether a page has a stored Calendly PAT - a boolean the client may see
 *  (never the value). Checks presence of ciphertext, not decryptability. */
export async function hasCalendlyPat(pageId: string): Promise<boolean> {
  if (!hasSupabaseAdminEnv()) return false
  const admin = createAdminClient()
  const { data } = await admin
    .from('page_secrets')
    .select('calendly_pat_encrypted')
    .eq('page_id', pageId)
    .maybeSingle<{ calendly_pat_encrypted: string | null }>()
  return Boolean(data?.calendly_pat_encrypted)
}

// ---- Shopify: per-page {shop, token} stored as ONE encrypted JSON blob (the
// secrets route does the encrypt-on-write; here we only READ it back for sync).
export type ShopifyCreds = { shop: string; token: string }

/** Decrypt the stored Shopify {shop, token} for a page (service-role), or null. */
export async function getShopifyCreds(pageId: string): Promise<ShopifyCreds | null> {
  if (!integrationCredentialsConfigured()) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('page_secrets')
    .select('shopify_credentials_encrypted')
    .eq('page_id', pageId)
    .maybeSingle<{ shopify_credentials_encrypted: string | null }>()
  const raw = decryptSecret(data?.shopify_credentials_encrypted ?? null)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ShopifyCreds
    return parsed && typeof parsed.shop === 'string' && typeof parsed.token === 'string' && parsed.shop && parsed.token ? parsed : null
  } catch {
    return null
  }
}

// ---- Square + Acuity: the remaining per-seller token providers, stored as one
// encrypted JSON blob each (secrets route encrypts on write). Square =
// {accessToken}; Acuity = {userId, apiKey}. Read back here for sync via a generic
// column-keyed helper.
export type SquareCreds = { accessToken: string }
export type AcuityCreds = { userId: string; apiKey: string }
type JsonCredProvider = 'square' | 'acuity'
const JSON_CRED_COLUMN: Record<JsonCredProvider, 'square_credentials_encrypted' | 'acuity_credentials_encrypted'> = {
  square: 'square_credentials_encrypted',
  acuity: 'acuity_credentials_encrypted',
}

async function getProviderJsonCreds<T>(pageId: string, provider: JsonCredProvider): Promise<T | null> {
  if (!integrationCredentialsConfigured()) return null
  const col = JSON_CRED_COLUMN[provider]
  const admin = createAdminClient()
  const { data } = await admin.from('page_secrets').select(col).eq('page_id', pageId).maybeSingle<Record<string, string | null>>()
  const raw = decryptSecret((data?.[col] as string | null) ?? null)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const getSquareCreds = (pageId: string) => getProviderJsonCreds<SquareCreds>(pageId, 'square')
export const getAcuityCreds = (pageId: string) => getProviderJsonCreds<AcuityCreds>(pageId, 'acuity')
