import { NextResponse, type NextRequest } from 'next/server'
import { handleNexieTurn, type NexieApprovalInput, type NexieMode } from '../../../../lib/agents/nexie'
import { authenticateNexieRequest } from '../../../../lib/agents/nexie-auth'
import { enforceRateLimit } from '../../../../lib/rate-limit'

export const maxDuration = 60

type NexieRequestBody = {
  message?: string
  threadId?: string | null
  mode?: NexieMode
  approval?: NexieApprovalInput | null
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie', 40, 60_000)
  if (limited) return limited

  // Reject oversized bodies before buffering/parsing (cheap DoS guard; the message itself is also
  // capped server-side). 32 KB is ample for a turn payload.
  if (Number(request.headers.get('content-length') || 0) > 32_000) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 })
  }

  let body: NexieRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response
  const { user, db } = auth

  if (!body.approval && (!body.message || body.message.trim().length === 0)) {
    return NextResponse.json({ error: 'Message is required unless approving an action.' }, { status: 400 })
  }

  try {
    const result = await handleNexieTurn({
      db,
      userId: user.id,
      // Only carry the buyer email into the transact path if it's CONFIRMED. An unconfirmed (or
      // attacker-chosen) address must never be stamped onto orders/negotiations — mirrors the
      // orders endpoint + push-token trigger. Unconfirmed users can still chat/search; their
      // bookings just go through unattributed rather than linked to an unverified email.
      userEmail: user.email_confirmed_at ? (user.email ?? null) : null,
      message: body.message,
      threadId: body.threadId,
      mode: body.mode === 'voice' ? 'voice' : 'text',
      approval: body.approval ?? null,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error('[Nexie] agent turn failed', error)
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
    service: 'nexie-agent',
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
