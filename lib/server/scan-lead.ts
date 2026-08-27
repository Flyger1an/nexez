import 'server-only'
import { captureError } from '../observability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

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
): Promise<{ converted: number }> {
  const address = (email || '').trim().toLowerCase()
  if (!ownerId || !address || !hasSupabaseAdminEnv()) return { converted: 0 }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('scan_leads')
      .update({ converted_owner_id: ownerId })
      .eq('email', address)
      // First account wins. A later re-signup must not rewrite the attribution to
      // whoever happened to sign in most recently.
      .is('converted_owner_id', null)
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
