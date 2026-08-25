// Durable outbound-webhook fan-out. The inline path in log-checkout-event fires
// endpoints best-effort in the request; this function makes each delivery its
// own retried step instead. Semantics mirror the inline path exactly: plan gate
// at dispatch time, per-page endpoints from page_secrets, account-level rows
// from outbound_webhooks (with last_delivery_at/last_status bookkeeping), and
// the shared fireOutboundWebhook guardrails (SSRF checks, HMAC, timeout,
// no-redirect).
//
// Retry policy: a delivery rejected by the endpoint validator (SSRF/https
// rules) is permanent and recorded without retrying or failing the run (it is a
// user configuration problem, not an infrastructure one); a network error or
// non-2xx response throws so Inngest retries that one endpoint's step. Steps
// that already delivered are memoized and never re-fire.

import { inngest } from '../client'
import { OUTBOUND_WEBHOOKS_DISPATCH, type OutboundWebhooksDispatchData } from '../events'
import { fireOutboundWebhook, type OutboundWebhookPayload } from '../../webhooks'
import { ownerAllows } from '../../server/plan'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import {
  outboundWebhooksForDelivery,
  resolveOutboundWebhookSecret,
} from '../../server/outbound-webhook-config'

type Endpoint = {
  /** Stable step id: owner:<row id> or page:<index>. */
  key: string
  url: string
  secret: string | null
  /** outbound_webhooks row id for delivery-status bookkeeping (owner rows only). */
  ownerRowId: string | null
}

export const dispatchOutboundWebhooks = inngest.createFunction(
  { id: 'outbound-webhooks-dispatch', retries: 3, triggers: { event: OUTBOUND_WEBHOOKS_DISPATCH } },
  async ({ event, step }) => {
    const data = event.data as OutboundWebhooksDispatchData
    const payload = data.payload as OutboundWebhookPayload

    if (!hasSupabaseAdminEnv()) return { skipped: 'no_admin_env' }
    const admin = createAdminClient()

    // Plan gate at DISPATCH time (Pro+), same as the inline path: a downgraded
    // owner must stop receiving both per-page and account-level deliveries.
    const allowed = await step.run('plan-gate', async () => {
      if (!data.ownerId) return false
      return ownerAllows(admin, data.ownerId, 'outboundWebhooks')
    })
    if (!allowed) return { skipped: 'plan' }

    const endpoints = await step.run('load-endpoints', async (): Promise<Endpoint[]> => {
      const found: Endpoint[] = []

      // Per-page webhooks (a page's Settings), shape [{url, secret?}] or [url].
      if (data.pageId) {
        const { data: pageSecrets } = await admin
          .from('page_secrets')
          .select('outbound_webhooks')
          .eq('page_id', data.pageId)
          .maybeSingle()
        const rows = (pageSecrets as { outbound_webhooks?: unknown } | null)?.outbound_webhooks
        outboundWebhooksForDelivery(rows).forEach((row, index) => {
          found.push({ key: `page:${index}`, url: row.url, secret: row.secret, ownerRowId: null })
        })
      }

      // Account-level webhooks (Tools -> Developer platform).
      const { data: ownerRows } = await admin
        .from('outbound_webhooks')
        .select('id, url, secret')
        .eq('owner_id', data.ownerId)
        .eq('active', true)
      for (const row of (ownerRows ?? []) as Array<{ id: string; url: string; secret: string | null }>) {
        if (!row?.url) continue
        found.push({
          key: `owner:${row.id}`,
          url: row.url,
          secret: resolveOutboundWebhookSecret(row.secret),
          ownerRowId: row.id,
        })
      }

      return found
    })

    if (!endpoints.length) return { delivered: 0, endpoints: 0 }

    const results = await Promise.all(
      endpoints.map((endpoint) =>
        step.run(`deliver:${endpoint.key}`, async () => {
          const res = await fireOutboundWebhook(endpoint.url, endpoint.secret, payload)

          if (endpoint.ownerRowId) {
            try {
              await admin
                .from('outbound_webhooks')
                .update({
                  last_delivery_at: new Date().toISOString(),
                  last_status: res.ok ? 'ok' : res.error || `http_${res.status ?? 'error'}`,
                })
                .eq('id', endpoint.ownerRowId)
            } catch {
              // status bookkeeping is best-effort
            }
          }

          if (!res.ok) {
            // Validator rejections (SSRF/https/private-host rules; all start
            // with "Webhook endpoint") are permanent misconfigurations: record
            // them, do not retry, do not fail the run.
            if (res.error?.startsWith('Webhook endpoint')) {
              return { ok: false, status: null, permanent: res.error }
            }
            throw new Error(res.error || `http_${res.status ?? 'error'}`)
          }
          return { ok: true, status: res.status ?? null, permanent: null }
        }),
      ),
    )

    return { delivered: results.filter((r) => r.ok).length, endpoints: endpoints.length }
  },
)
