import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCalendlyPat } from './page-integration-credentials'
import {
  getMerchantConnectorRow,
  getUsableConnectorCredential,
  type OAuthCredential,
} from './merchant-connectors'

export type CalendlyCredentialSource = {
  accessToken: string
  source: 'oauth' | 'personal_token'
}

/**
 * Resolve the listing's managed Calendly OAuth token, with a legacy personal
 * token fallback only when no active managed connection exists. Once OAuth is
 * connected, an expired authorization must be reconnected instead of silently
 * masking it with an older personal token.
 */
export async function getCalendlyCredential(
  admin: SupabaseClient,
  pageId: string,
): Promise<CalendlyCredentialSource | null> {
  const row = await getMerchantConnectorRow(admin, pageId, 'calendly')
  if (row && row.status !== 'revoked') {
    const managed = await getUsableConnectorCredential(admin, pageId, 'calendly')
    if (!managed.ok) return null
    return {
      accessToken: (managed.credential as OAuthCredential).accessToken,
      source: 'oauth',
    }
  }

  const personalToken = await getCalendlyPat(pageId)
  return personalToken ? { accessToken: personalToken, source: 'personal_token' } : null
}
