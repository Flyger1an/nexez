import { NextResponse, type NextRequest } from 'next/server'
import { handleNexxiTurn, type NexxiApprovalInput, type NexxiMode } from '../../../../lib/agents/nexxi'
import { authenticateNexxiRequest } from '../../../../lib/agents/nexxi-auth'
import { createNexxiTurnDb } from '../../../../lib/agents/nexxi-turn-db'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { NEXXI_CONTRACT_VERSION, NexxiTurnResponseSchema } from '../../../../contracts/nexxi/v1'

export const maxDuration = 60

type NexxiRequestBody = {
  message?: string
  threadId?: string | null
  mode?: NexxiMode
  approval?: NexxiApprovalInput | null
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi', 40, 60_000)
  if (limited) return limited

  // Reject oversized bodies before buffering/parsing (cheap DoS guard; the message itself is also
  // capped server-side). 32 KB is ample for a turn payload.
  if (Number(request.headers.get('content-length') || 0) > 32_000) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 })
  }

  let body: NexxiRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response
  const { user, db } = auth

  // Per-user cap on top of the per-IP gate above: an account can't multiply its expensive-turn quota
  // by rotating IPs. Fails closed on a shared-store outage (each turn is an LLM call + can trigger a
  // money action). No-op until a Redis/KV store is provisioned.
  const userLimited = await enforceRateLimit(request, 'agents:nexxi:user', 20, 60_000, { subject: user.id, failClosed: true })
  if (userLimited) return userLimited

  if (!body.approval && (!body.message || body.message.trim().length === 0)) {
    return NextResponse.json({ error: 'Message is required unless approving an action.' }, { status: 400 })
  }

  try {
    const result = await handleNexxiTurn({
      // Every ordinary buyer table remains on the authenticated RLS client. Only the
      // approval ledger is routed through a lazy server-only client because browser
      // roles are intentionally read-only on that table.
      db: createNexxiTurnDb(db),
      userId: user.id,
      // Only carry the buyer email into the transact path if it's CONFIRMED. An unconfirmed (or
      // attacker-chosen) address must never be stamped onto orders/negotiations - mirrors the
      // orders endpoint + push-token trigger. Unconfirmed users can still chat/search; their
      // bookings just go through unattributed rather than linked to an unverified email.
      userEmail: user.email_confirmed_at ? (user.email ?? null) : null,
      message: body.message,
      threadId: body.threadId,
      mode: body.mode === 'voice' ? 'voice' : 'text',
      approval: body.approval ?? null,
    })

    const response = NexxiTurnResponseSchema.parse({
      ok: true,
      contractVersion: NEXXI_CONTRACT_VERSION,
      ...result,
    })
    return NextResponse.json(response)
  } catch (error) {
    console.error('[Nexxi] agent turn failed', error)
    return NextResponse.json(
      {
        error: 'Nexxi hit a snag before completing that turn.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'nexxi-agent',
    contractVersion: NEXXI_CONTRACT_VERSION,
    capabilities: [
      'voice_input',
      'text_chat',
      'search_pages',
      'initiate_negotiation',
      'trigger_booking',
      'approval_flow',
      'supabase_memory',
      'order_history',
    ],
  })
}
