import { after } from 'next/server'
import { authenticateApiKey } from '../../../lib/server/api-auth'
import { createAdminClient } from '../../../utils/supabase/admin'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { a2aStreamingEnabled } from '../../../lib/a2a/capabilities'
import { DurableA2ARuntime } from '../../../lib/a2a/durable-task-runtime'
import {
  A2A_ERROR,
  A2AProtocolError,
  afterSequence,
  isFinalTaskState,
  jsonRpcError,
  jsonRpcSuccess,
  parseJsonRpcRequest,
  parseMessageSendParams,
  parseTaskQueryParams,
  type A2ATask,
  type JsonRpcId,
  type JsonRpcRequest,
} from '../../../lib/a2a/protocol'

export const maxDuration = 60

const MAX_BODY_BYTES = 64_000
const STREAM_DEADLINE_MS = 55_000
const STREAM_HEARTBEAT_MS = 10_000

type Runtime = DurableA2ARuntime

type HandlerDependencies = {
  authenticate: typeof authenticateApiKey
  rateLimit: typeof enforceRateLimit
  runtime: () => Runtime
  streamingEnabled: () => boolean
  schedule: (work: () => Promise<void>) => void
}

const defaultDependencies: HandlerDependencies = {
  authenticate: authenticateApiKey,
  rateLimit: enforceRateLimit,
  runtime: () => new DurableA2ARuntime(createAdminClient()),
  streamingEnabled: a2aStreamingEnabled,
  schedule: (work) => {
    after(async () => {
      try {
        await work()
      } catch (error) {
        console.error('[A2A] scheduled task execution failed', error)
      }
    })
  },
}

export function createA2APostHandler(
  dependencies: Partial<HandlerDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps = { ...defaultDependencies, ...dependencies }

  return async function handleA2APost(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('application/json')) {
      return jsonResponse(
        jsonRpcError(null, A2A_ERROR.contentTypeNotSupported, 'Content-Type must be application/json.'),
        415,
      )
    }

    let raw: unknown
    try {
      raw = await readJsonBody(request)
    } catch (error) {
      if (error instanceof A2AProtocolError) return protocolErrorResponse(error, null)
      return jsonResponse(jsonRpcError(null, A2A_ERROR.parse, 'Invalid JSON payload'), 400)
    }

    let rpc: JsonRpcRequest
    try {
      rpc = parseJsonRpcRequest(raw)
    } catch (error) {
      return protocolErrorResponse(error, null)
    }

    const ipLimited = await deps.rateLimit(request, 'a2a:ip', 120, 60_000)
    if (ipLimited) return rateLimitErrorResponse(rpc.id, ipLimited)

    const auth = await deps.authenticate(request)
    if (!auth.ok) {
      return jsonResponse(
        jsonRpcError(rpc.id, A2A_ERROR.server, auth.error),
        auth.status,
      )
    }

    const ownerLimited = await deps.rateLimit(request, 'a2a:owner', 60, 60_000, {
      subject: auth.ownerId,
      failClosed: true,
    })
    if (ownerLimited) return rateLimitErrorResponse(rpc.id, ownerLimited)

    const runtime = deps.runtime()
    try {
      switch (rpc.method) {
        case 'message/send':
          return handleMessageSend(rpc, runtime, auth, deps)
        case 'message/stream':
          if (!deps.streamingEnabled()) {
            throw new A2AProtocolError(
              A2A_ERROR.unsupported,
              'This operation is not supported',
            )
          }
          return handleMessageStream(request, rpc, runtime, auth)
        case 'tasks/get':
          return handleTaskGet(rpc, runtime, auth.ownerId)
        case 'tasks/resubscribe':
          if (!deps.streamingEnabled()) {
            throw new A2AProtocolError(
              A2A_ERROR.unsupported,
              'This operation is not supported',
            )
          }
          return handleTaskResubscribe(request, rpc, runtime, auth.ownerId)
        default:
          throw new A2AProtocolError(A2A_ERROR.methodNotFound, 'Method not found')
      }
    } catch (error) {
      console.error('[A2A] request failed', {
        method: rpc.method,
        error: error instanceof Error ? error.message : 'unknown error',
      })
      return protocolErrorResponse(error, rpc.id)
    }
  }
}

export const POST = createA2APostHandler()

async function handleMessageSend(
  rpc: JsonRpcRequest,
  runtime: Runtime,
  auth: { ownerId: string; keyId: string },
  deps: HandlerDependencies,
): Promise<Response> {
  const params = parseMessageSendParams(rpc.params)
  const accepted = await runtime.acceptMessage({
    ownerId: auth.ownerId,
    apiKeyId: auth.keyId,
    params,
  })

  let task = accepted.task
  if (task.status.state === 'submitted') {
    if (params.configuration.blocking) {
      task = await runtime.executeTask(auth.ownerId, accepted.taskId)
      if (!isFinalTaskState(task.status.state)) {
        task = await runtime.waitForSettled(auth.ownerId, accepted.taskId, {
          historyLength: params.configuration.historyLength,
        })
      }
    } else {
      deps.schedule(() => runtime.executeTask(auth.ownerId, accepted.taskId).then(() => undefined))
    }
  } else if (task.status.state === 'working' && params.configuration.blocking) {
    task = await runtime.waitForSettled(auth.ownerId, accepted.taskId, {
      historyLength: params.configuration.historyLength,
    })
  }

  if (params.configuration.historyLength !== undefined) {
    task = await runtime.task(
      auth.ownerId,
      accepted.taskId,
      params.configuration.historyLength,
    )
  }
  return jsonResponse(jsonRpcSuccess(rpc.id, task))
}

async function handleMessageStream(
  request: Request,
  rpc: JsonRpcRequest,
  runtime: Runtime,
  auth: { ownerId: string; keyId: string },
): Promise<Response> {
  const params = parseMessageSendParams(rpc.params)
  const accepted = await runtime.acceptMessage({
    ownerId: auth.ownerId,
    apiKeyId: auth.keyId,
    params,
  })
  return streamTask({
    id: rpc.id,
    ownerId: auth.ownerId,
    taskId: accepted.taskId,
    historyLength: params.configuration.historyLength,
    cursor: afterSequence(request.headers.get('last-event-id'), params.metadata),
    runtime,
    executeSubmitted: true,
  })
}

async function handleTaskGet(
  rpc: JsonRpcRequest,
  runtime: Runtime,
  ownerId: string,
): Promise<Response> {
  const params = parseTaskQueryParams(rpc.params)
  const task = await runtime.task(ownerId, params.id, params.historyLength)
  return jsonResponse(jsonRpcSuccess(rpc.id, task))
}

async function handleTaskResubscribe(
  request: Request,
  rpc: JsonRpcRequest,
  runtime: Runtime,
  ownerId: string,
): Promise<Response> {
  const params = parseTaskQueryParams(rpc.params)
  await runtime.task(ownerId, params.id, params.historyLength)
  return streamTask({
    id: rpc.id,
    ownerId,
    taskId: params.id,
    historyLength: params.historyLength,
    cursor: afterSequence(request.headers.get('last-event-id'), params.metadata),
    runtime,
    executeSubmitted: true,
  })
}

function streamTask(input: {
  id: JsonRpcId
  ownerId: string
  taskId: string
  historyLength?: number
  cursor: number
  runtime: Runtime
  executeSubmitted: boolean
}): Response {
  const encoder = new TextEncoder()
  const abortController = new AbortController()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void pumpTaskStream(controller, encoder, { ...input, signal: abortController.signal })
    },
    cancel() {
      abortController.abort()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}

async function pumpTaskStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  input: {
    id: JsonRpcId
    ownerId: string
    taskId: string
    historyLength?: number
    cursor: number
    runtime: Runtime
    executeSubmitted: boolean
    signal: AbortSignal
  },
): Promise<void> {
  let cursor = input.cursor
  const deadline = Date.now() + STREAM_DEADLINE_MS
  let nextHeartbeatAt = Date.now() + STREAM_HEARTBEAT_MS
  let execution: Promise<A2ATask> | null = null

  try {
    let task = await input.runtime.task(input.ownerId, input.taskId, input.historyLength)
    controller.enqueue(encoder.encode(sseData(jsonRpcSuccess(input.id, task))))

    if (input.executeSubmitted && task.status.state === 'submitted') {
      execution = input.runtime.executeTask(input.ownerId, input.taskId)
      void execution.catch(() => undefined)
    }

    while (true) {
      if (input.signal.aborted) return
      task = await input.runtime.task(input.ownerId, input.taskId, input.historyLength)
      const latestSequence = taskSequence(task)
      if (latestSequence > cursor) {
        const events = await input.runtime.eventsAfter(input.ownerId, input.taskId, cursor)
        for (const event of events) {
          cursor = event.sequence
          controller.enqueue(
            encoder.encode(sseData(jsonRpcSuccess(input.id, event.payload), event.sequence)),
          )
        }
      }

      if (isFinalTaskState(task.status.state) && cursor >= latestSequence) {
        if (execution) await execution
        controller.close()
        return
      }

      if (Date.now() >= deadline) {
        controller.close()
        return
      }
      if (Date.now() >= nextHeartbeatAt) {
        controller.enqueue(encoder.encode(': keep-alive\n\n'))
        nextHeartbeatAt = Date.now() + STREAM_HEARTBEAT_MS
      }
      await sleep(300)
    }
  } catch (error) {
    if (input.signal.aborted) return
    const response = error instanceof A2AProtocolError
      ? jsonRpcError(input.id, error.code, error.message, error.data)
      : jsonRpcError(input.id, A2A_ERROR.internal, 'Internal server error')
    controller.enqueue(encoder.encode(sseData(response)))
    controller.close()
  }
}

function taskSequence(task: A2ATask): number {
  const value = task.metadata?.['nexez:eventSequence']
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0
}

function sseData(payload: unknown, sequence?: number): string {
  return `${sequence === undefined ? '' : `id: ${sequence}\n`}data: ${JSON.stringify(payload)}\n\n`
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new A2AProtocolError(
      A2A_ERROR.invalidRequest,
      'Request body too large.',
      undefined,
      413,
    )
  }

  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new A2AProtocolError(
        A2A_ERROR.invalidRequest,
        'Request body too large.',
        undefined,
        413,
      )
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return JSON.parse(text)
}

function protocolErrorResponse(error: unknown, id: JsonRpcId): Response {
  if (error instanceof A2AProtocolError) {
    return jsonResponse(jsonRpcError(id, error.code, error.message, error.data), error.httpStatus)
  }
  return jsonResponse(jsonRpcError(id, A2A_ERROR.internal, 'Internal server error'), 500)
}

function rateLimitErrorResponse(id: JsonRpcId, limited: Response): Response {
  const retryAfter = limited.headers.get('retry-after')
  return jsonResponse(
    jsonRpcError(id, A2A_ERROR.server, 'Rate limit exceeded.', {
      ...(retryAfter ? { retryAfterSeconds: Number(retryAfter) || retryAfter } : {}),
    }),
    429,
    retryAfter ? { 'retry-after': retryAfter } : undefined,
  )
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
