import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'
import { requirePageAccess } from '../../../../../../../lib/server/require-page-access'
import {
  disconnectMerchantConnector,
  isManagedConnectorProvider,
} from '../../../../../../../lib/server/merchant-connectors'

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; provider: string }> }) {
  const limited = await enforceRateLimit(request, 'connector-disconnect', 20, 60_000)
  if (limited) return limited
  const { id: pageId, provider } = await ctx.params
  if (!isManagedConnectorProvider(provider)) {
    return NextResponse.json({ error: 'Unsupported integration.' }, { status: 404 })
  }
  const gate = await requirePageAccess({ pageId, unavailableMessage: 'Integration connections are not configured.' })
  if (!gate.ok) return gate.response
  const result = await disconnectMerchantConnector(gate.admin, gate.access.pageId, gate.access.ownerId, provider)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true, provider })
}
