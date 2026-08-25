import { NextResponse } from 'next/server'
import { minPlanForFeature } from '../../../lib/billing'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { fireOutboundWebhook, type OutboundWebhookPayload } from '../../../lib/webhooks'
import { outboundWebhooksForDelivery } from '../../../lib/server/outbound-webhook-config'
import { ownerAllows } from '../../../lib/server/plan'
import { requirePageAccess } from '../../../lib/server/require-page-access'

/** Send a fixed test event to an endpoint already saved on an editable listing. */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'test-outbound', 10, 60_000)
  if (limited) return limited

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown; pageId?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : ''
  if (!endpoint || !pageId) {
    return NextResponse.json({ error: 'A saved endpoint and listing are required.' }, { status: 400 })
  }

  const gate = await requirePageAccess({ pageId, unavailableMessage: 'Listing not available.' })
  if (!gate.ok) return gate.response
  const { access, admin } = gate
  if (!(await ownerAllows(admin, access.ownerId, 'outboundWebhooks'))) {
    const required = minPlanForFeature('outboundWebhooks')
    return NextResponse.json(
      { error: `Outbound webhooks are available on the ${required.name} plan and up.`, upgrade: required.id },
      { status: 402 },
    )
  }

  const [{ data: page }, { data: secrets, error: secretError }] = await Promise.all([
    admin.from('pages').select('id, slug, name').eq('id', access.pageId).maybeSingle(),
    admin.from('page_secrets').select('outbound_webhooks').eq('page_id', access.pageId).maybeSingle(),
  ])
  if (secretError) return NextResponse.json({ error: 'Could not read webhook settings.' }, { status: 500 })
  if (!page) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  const saved = outboundWebhooksForDelivery(
    (secrets as { outbound_webhooks?: unknown } | null)?.outbound_webhooks,
  ).find((candidate) => candidate.url === endpoint)
  if (!saved) return NextResponse.json({ error: 'Save this endpoint before testing it.' }, { status: 404 })

  const payload: OutboundWebhookPayload = {
    event: 'test.webhook',
    timestamp: new Date().toISOString(),
    page: { id: page.id, slug: page.slug, name: page.name || page.slug },
    data: {
      test: true,
      source: 'listing_settings',
      message: 'Test event from Nexez listing settings.',
    },
  }
  const result = await fireOutboundWebhook(saved.url, saved.secret, payload)
  return NextResponse.json({
    success: result.ok,
    status: result.status ?? null,
    error: result.error ?? null,
    endpoint: saved.url,
    event: payload.event,
  })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', usage: 'POST { endpoint, pageId }, using a saved listing endpoint.' })
}
