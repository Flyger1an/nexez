import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { hashApiKey, parseBearer } from '../api-keys'
import { ownerAllows } from './plan'

export type ApiAuthOk = { ok: true; ownerId: string; keyId: string }
export type ApiAuthErr = { ok: false; error: string; status: number }
export type ApiAuthResult = ApiAuthOk | ApiAuthErr

/**
 * Authenticate a programmatic API request by its Bearer API key.
 * Resolves the key's owner via the service-role client (bypasses RLS), checks
 * revocation, and records last_used_at. Tenancy MUST still be enforced by the
 * caller (always filter DB ops by the returned ownerId).
 */
export async function authenticateApiKey(request: Request): Promise<ApiAuthResult> {
  if (!hasSupabaseAdminEnv()) {
    return { ok: false, error: 'Programmatic API is not configured on this deployment.', status: 503 }
  }

  const token = parseBearer(request.headers.get('authorization'))
  if (!token) {
    return {
      ok: false,
      error: 'Missing or malformed API key. Use header: Authorization: Bearer nxz_live_...',
      status: 401,
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('api_keys')
    .select('id, owner_id, revoked_at')
    .eq('key_hash', hashApiKey(token))
    .maybeSingle<{ id: string; owner_id: string; revoked_at: string | null }>()

  if (error || !data) {
    return { ok: false, error: 'Invalid API key.', status: 401 }
  }
  if (data.revoked_at) {
    return { ok: false, error: 'This API key has been revoked.', status: 401 }
  }

  // Plan gate: programmatic API access is a Pro (`apiAccess`) capability, re-checked
  // on EVERY request. Keys aren't auto-revoked on downgrade, so a key minted on Pro
  // must stop working once the owner drops below Pro (the only enforcement otherwise
  // was at mint time — gating-review HIGH).
  if (!(await ownerAllows(admin, data.owner_id, 'apiAccess'))) {
    return { ok: false, error: 'API access requires the Pro plan. Upgrade to use the API.', status: 402 }
  }

  // Best-effort usage tracking; never blocks the request.
  void admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)

  return { ok: true, ownerId: data.owner_id, keyId: data.id }
}
