import { createClient } from '../utils/supabase/client'

// Provider keys persisted in public.user_integrations. Kept narrow so a typo in a
// caller can't silently create a phantom "connected" row.
export const INTEGRATION_PROVIDERS = [
  'calendly',
  'calendly_webhook',
  'stripe',
  'shopify',
  'acuity',
  'square',
] as const
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]

export type IntegrationStatusRow = {
  provider: string
  status: string
  detail: string | null
  last_event_at: string
}

/**
 * Persist a "connected" event for the signed-in owner so integration status is
 * cross-device (not browser-local). Best-effort: any failure is swallowed so the
 * import/connect UX never blocks on it (and pre-migration deploys degrade to the
 * existing localStorage behavior).
 */
export async function recordIntegration(provider: IntegrationProvider, detail?: string): Promise<void> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_integrations').upsert(
      {
        user_id: user.id,
        provider,
        status: 'connected',
        detail: detail ?? null,
        last_event_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
  } catch {
    // non-fatal — status persistence is a nicety, not a gate
  }
}

/** Load all integration status rows for the signed-in owner (empty on any error). */
export async function loadIntegrations(): Promise<IntegrationStatusRow[]> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []
    const { data } = await supabase
      .from('user_integrations')
      .select('provider,status,detail,last_event_at')
      .eq('user_id', user.id)
      .returns<IntegrationStatusRow[]>()
    return data ?? []
  } catch {
    return []
  }
}
