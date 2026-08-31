import { NextResponse, type NextRequest } from 'next/server'
import { type NexieApprovalInput, type NexieMode } from '../../../../../lib/agents/nexie'
import { authenticateNexieRequest } from '../../../../../lib/agents/nexie-auth'
import { runNexieExecution } from '../../../../../lib/agents/nexie-stream'
import { createNexieTurnDb } from '../../../../../lib/agents/nexie-turn-db'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { NEXIE_CONTRACT_VERSION, NexieTurnResponseSchema } from '../../../../../contracts/nexie/v1'

export const maxDuration = 60

type NexieStreamBody = {
  message?: string
  threadId?: string | null
  mode?: NexieMode
  approval?: NexieApprovalInput | null
}

/**
 * POST /api/agents/nexie/stream - Nexxi's web-client adapter over the shared execution stream:
 *   data: {"type":"token","value":"..."}   (progressive preview, may include pre-tool preamble)
 *   data: {"type":"done", ...NexieTurnResult}  (AUTHORITATIVE - clients render done.message + cards)
 *   data: {"type":"error","error":"..."}
 * The turn persists + returns exactly as the JSON route, so memory/threads/resume are unchanged.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie', 40, 60_000)
  if (limited) return limited

  // Reject oversized bodies before buffering/parsing (cheap DoS guard; the message is also capped).
  if (Number(request.headers.get('content-length') || 0) > 32_000) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 })
  }

  let body: NexieStreamBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response
  const { user, db } = auth

  // Per-user cap (see the JSON route): one account can't multiply its expensive-turn quota across IPs.
  const userLimited = await enforceRateLimit(request, 'agents:nexie:user', 20, 60_000, { subject: user.id, failClosed: true })
  if (userLimited) return userLimited

  if (!body.approval && (!body.message || body.message.trim().length === 0)) {
    return NextResponse.json({ error: 'Message is required unless approving an action.' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      try {
        await runNexieExecution(
          {
            // Match the JSON route: buyer data stays RLS-bound while only the approval
            // ledger uses the lazy server-only client.
            db: createNexieTurnDb(db),
            userId: user.id,
            // Confirmed-email gate (see the JSON route): never stamp an unverified address onto orders.
            userEmail: user.email_confirmed_at ? (user.email ?? null) : null,
            message: body.message,
            threadId: body.threadId,
            mode: body.mode === 'voice' ? 'voice' : 'text',
            approval: body.approval ?? null,
          },
          (event) => {
            if (event.type === 'text-delta') {
              send({ type: 'token', value: event.delta })
              return
            }

            const response = NexieTurnResponseSchema.parse({
              ok: true,
              contractVersion: NEXIE_CONTRACT_VERSION,
              ...event.result,
            })
            send({ type: 'done', ...response })
          },
        )
      } catch (error) {
        console.error('[Nexie] streamed turn failed', error)
        send({ type: 'error', error: error instanceof Error ? error.message : 'Nexxi hit a snag before completing that turn.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Disable proxy buffering so tokens flush immediately.
      'x-accel-buffering': 'no',
    },
  })
}
