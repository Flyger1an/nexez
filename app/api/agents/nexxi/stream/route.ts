import { NextResponse, type NextRequest } from 'next/server'
import { type NexxiApprovalInput, type NexxiMode } from '../../../../../lib/agents/nexxi'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { runNexxiExecution } from '../../../../../lib/agents/nexxi-stream'
import { createNexxiTurnDb } from '../../../../../lib/agents/nexxi-turn-db'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { NEXXI_CONTRACT_VERSION, NexxiTurnResponseSchema } from '../../../../../contracts/nexxi/v1'

export const maxDuration = 60

type NexxiStreamBody = {
  message?: string
  threadId?: string | null
  mode?: NexxiMode
  approval?: NexxiApprovalInput | null
}

/**
 * POST /api/agents/nexxi/stream - Nexxi's web-client adapter over the shared execution stream:
 *   data: {"type":"token","value":"..."}   (progressive preview, may include pre-tool preamble)
 *   data: {"type":"done", ...NexxiTurnResult}  (AUTHORITATIVE - clients render done.message + cards)
 *   data: {"type":"error","error":"..."}
 * The turn persists + returns exactly as the JSON route, so memory/threads/resume are unchanged.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi', 40, 60_000)
  if (limited) return limited

  // Reject oversized bodies before buffering/parsing (cheap DoS guard; the message is also capped).
  if (Number(request.headers.get('content-length') || 0) > 32_000) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 })
  }

  let body: NexxiStreamBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response
  const { user, db } = auth

  // Per-user cap (see the JSON route): one account can't multiply its expensive-turn quota across IPs.
  const userLimited = await enforceRateLimit(request, 'agents:nexxi:user', 20, 60_000, { subject: user.id, failClosed: true })
  if (userLimited) return userLimited

  if (!body.approval && (!body.message || body.message.trim().length === 0)) {
    return NextResponse.json({ error: 'Message is required unless approving an action.' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      try {
        await runNexxiExecution(
          {
            // Match the JSON route: buyer data stays RLS-bound while only the approval
            // ledger uses the lazy server-only client.
            db: createNexxiTurnDb(db),
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

            const response = NexxiTurnResponseSchema.parse({
              ok: true,
              contractVersion: NEXXI_CONTRACT_VERSION,
              ...event.result,
            })
            send({ type: 'done', ...response })
          },
        )
      } catch (error) {
        console.error('[Nexxi] streamed turn failed', error)
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
