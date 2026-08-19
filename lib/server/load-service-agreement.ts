import 'server-only'
import { recoverBearerToken } from './bearer-token'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

export async function loadServiceAgreementTokenBySession(stripeSessionId: string | null | undefined): Promise<{
  token: string
  agreementId: string
  status: string
} | null> {
  const sessionId = (stripeSessionId ?? '').trim()
  if (!sessionId || sessionId.length > 255 || !hasSupabaseAdminEnv()) return null

  const { data } = await createAdminClient()
    .from('service_agreements')
    .select('id, status, access_token_encrypted')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle<{ id: string; status: string; access_token_encrypted: string | null }>()
  if (!data) return null
  const token = recoverBearerToken({ encrypted: data.access_token_encrypted })
  return token ? { token, agreementId: data.id, status: data.status } : null
}
