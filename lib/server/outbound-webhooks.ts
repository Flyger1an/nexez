import { fireOutboundWebhook, type OutboundWebhookPayload } from '../webhooks'
import { ownerAllows } from './plan'

// The codebase uses loosely-typed Supabase clients; we only need `.from()`.
// Kept `any`-returning to avoid fighting the generated Database types.
type AdminClient = { from: (table: string) => any }

type OutboundWebhookRow = { id: string; url: string; secret: string | null }

export type OutboundDeliveryResult = {
  id: string
  endpoint: string
  ok: boolean
  status?: number
  error?: string
}

/**
 * Fire all of an owner's ACTIVE account-level outbound webhooks with a signed
 * payload, recording each delivery's status. Reuses fireOutboundWebhook so the
 * SSRF guard, HMAC signing, timeout, and no-redirect policy are shared with the
 * per-page path. Best-effort: never throws — returns per-endpoint results.
 */
export async function fireOwnerOutboundWebhooks(
  admin: AdminClient,
  ownerId: string | null | undefined,
  payload: OutboundWebhookPayload,
): Promise<OutboundDeliveryResult[]> {
  if (!ownerId) return []

  // Plan gate at DISPATCH time (not just at create time): outbound webhooks are
  // Pro+, so a downgraded owner must stop receiving deliveries. Both callers pass
  // a service-role client, so the plan read resolves the real plan (not RLS-empty).
  if (!(await ownerAllows(admin, ownerId, 'outboundWebhooks'))) return []

  let rows: OutboundWebhookRow[] = []
  try {
    const { data, error } = await admin
      .from('outbound_webhooks')
      .select('id, url, secret')
      .eq('owner_id', ownerId)
      .eq('active', true)
    if (error || !Array.isArray(data)) return []
    rows = data
  } catch {
    return []
  }

  const results: OutboundDeliveryResult[] = []
  for (const wh of rows) {
    if (!wh?.url) continue
    const res = (await fireOutboundWebhook(wh.url, wh.secret ?? null, payload)) as {
      ok: boolean
      status?: number
      error?: string
    }
    results.push({ id: wh.id, endpoint: wh.url, ok: res.ok, status: res.status, error: res.error })
    try {
      await admin
        .from('outbound_webhooks')
        .update({
          last_delivery_at: new Date().toISOString(),
          last_status: res.ok ? 'ok' : res.error || `http_${res.status ?? 'error'}`,
        })
        .eq('id', wh.id)
    } catch {
      // status bookkeeping is best-effort
    }
  }
  return results
}
