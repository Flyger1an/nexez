import 'server-only'
import { captureError } from '../observability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { hashScanLeadToken, isScanLeadToken } from './scan-lead-token'

export const SCAN_ATTRIBUTION_COOKIE = 'nexez_scan_attribution'

/**
 * Stamp scan leads for `email` as converted to `ownerId`.
 *
 * This is the only figure that says whether the public scanner earns its place:
 * scans run is vanity, addresses captured is nearly vanity, addresses that became
 * accounts is the number. Without this the column would exist and stay empty.
 *
 * Best effort by design. It runs after sign-in, inside `after()`, and a failure
 * here must never cost someone their session, so it swallows and reports.
 */
export async function markScanLeadsConverted(
  ownerId: string,
  email: string,
  attributionToken?: string | null,
): Promise<{ converted: number }> {
  const address = (email || '').trim().toLowerCase()
  if (!ownerId || !address || !hasSupabaseAdminEnv()) return { converted: 0 }
  const cleanToken = attributionToken?.trim() ?? ''
  // A supplied but malformed token must never broaden into the legacy email-only
  // fallback. The fallback exists only for conversions with no scan handoff.
  if (attributionToken != null && !isScanLeadToken(cleanToken)) return { converted: 0 }

  try {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const [publishedResult, grantResult] = await Promise.all([
      admin
        .from('pages')
        .select('created_at')
        .eq('owner_id', ownerId)
        .eq('is_published', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<{ created_at: string }>(),
      admin
        .from('promotional_plan_grants')
        .select('starts_at')
        .eq('owner_id', ownerId)
        .eq('status', 'active')
        .order('starts_at', { ascending: true })
        .limit(1)
        .maybeSingle<{ starts_at: string }>(),
    ])

    const milestonePatch = {
      converted_owner_id: ownerId,
      converted_at: nowIso,
      ...(publishedResult.data?.created_at ? { published_at: publishedResult.data.created_at } : {}),
      ...(grantResult.data?.starts_at ? { grant_activated_at: grantResult.data.starts_at } : {}),
    }
    let query = admin
      .from('scan_leads')
      .update(milestonePatch)
      .eq('email', address)
      // First account wins. A later re-signup must not rewrite the attribution to
      // whoever happened to sign in most recently.
      .is('converted_owner_id', null)

    if (cleanToken) {
      query = query.eq('onboarding_token_hash', hashScanLeadToken(cleanToken))
    }

    const { data, error } = await query
      .select('id')
      .returns<{ id: string }[]>()

    if (error) {
      captureError(error, { area: 'scan-lead-conversion' })
      return { converted: 0 }
    }
    return { converted: data?.length ?? 0 }
  } catch (error) {
    captureError(error, { area: 'scan-lead-conversion' })
    return { converted: 0 }
  }
}
