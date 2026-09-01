import { after } from 'next/server'
import { authenticateApiKey } from '../../../../lib/server/api-auth'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { createAdminClient } from '../../../../utils/supabase/admin'
import {
  A2A_V1_ERROR,
  A2A_V1_PROTOCOL_VERSION,
  A2AV1ProtocolError,
  jsonRpcError,
  parseA2AV1JsonRpcRequest,
  parseA2AV1SendMessageParams,
  parseA2AV1TaskQueryParams,
  requireA2AV1Version,
  type A2AV1JsonRpcId,
  type A2AV1JsonRpcRequest,
} from '../../../../lib/a2a/v1/protocol'
import {
  A2AV1Runtime,
  isA2AV1TaskSettled,
  taskEventSequence,
} from '../../../../lib/a2a/v1/runtime'
import type { A2AV1TaskSnapshot } from '../../../../lib/a2a/v1/task-store'
import {
  tailorA2AV1StreamResponse,
  tailorA2AV1Task,
} from '../../../../lib/a2a/v1/output-modes'

export const maxDuration = 60

const MAX_BODY_BYTES = 64 * 1024
const STREAM_DEADLINE_MS = 55_000
const STREAM_HEARTBEAT_MS = 10_000
const AUTH_ERROR_CODE = -32000
const RATE_LIMIT_ERROR_CODE = -32029

export type A2AV1RouteDependencies = {
  authenticate: typeof authenticateApiKey
  rateLimit: typeof enforceRateLimit
  runtime: () => A2AV1Runtime
  schedule: (work: () => Promise<void>) => void
}

const defaultDependencies: A2AV1RouteDependencies = {
  authenticate: authenticateApiKey,
  rateLimit: enforceRateLimit,
  runtime: () => new A2AV1Runtime(createAdminClient()),
  schedule: (work) => {
    after(async () => {
      try {
        await work()
      } catch (error) {
        console.error('[A2A] Scheduled task execution failed', error)
      }
    })
  },
}

export function createA2AV1PostHandler(
  overrides: Partial<A2AV1RouteDependencies> = {},
): (request: Request) => Promise<Response> {
  const dependencies = { ...defaultDependencies, ...overrides }

  return async function handleA2AV1Request(request: Request): Promise<Response> {
    const ipLimited = await dependencies.rateLimit(request, 'a2a:v1:ip', 120, 60_000)
    if (ipLimited) return rateLimitResponse(null, ipLimited)

    const mediaType = request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase()
    if (mediaType !== 'application/json') {
      return protocolResponse(
        null,
        new A2AV1ProtocolError(
          A2A_V1_ERROR.contentTypeNotSupported,
          'Content-Type must be application/json.',
          undefined,
          415,
        ),
      )
    }

    let raw: unknown
    try {
      raw = await readJsonBody(request)
    } catch (error) {
      return protocolResponse(null, normalizeReadError(error))
    }

    let rpc: A2AV1JsonRpcRequest
    try {
      rpc = parseA2AV1JsonRpcRequest(raw)
      requireA2AV1Version(request.headers.get('a2a-version'))
      rejectUnsupportedExtensions(request.headers.get('a2a-extensions'))
    } catch (error) {
      return protocolResponse(jsonRpcId(raw), error)
    }

    const auth = await dependencies.authenticate(request)
    if (!auth.ok) return authenticationResponse(rpc.id, auth.error, auth.status)

    const ownerLimited = await dependencies.rateLimit(
      request,
      'a2a:v1:owner',
      120,
      60_000,
      { subject: auth.ownerId, failClosed: true },
    )
    if (ownerLimited) return rateLimitResponse(rpc.id, ownerLimited)

    if (rpc.method === 'SendMessage' || rpc.method === 'SendStreamingMessage') {
      const turnLimited = await dependencies.rateLimit(
        request,
        'a2a:v1:turn',
        20,
        60_000,
        { subject: auth.ownerId, failClosed: true },
      )
      if (turnLimited) return rateLimitResponse(rpc.id, turnLimited)
    }

    try {
      const runtime = dependencies.runtime()
      switch (rpc.method) {
        case 'SendMessage':
          return await handleSendMessage(rpc, runtime, auth, dependencies)
        case 'SendStreamingMessage':
          return await handleSendStreamingMessage(request, rpc, runtime, auth)
        case 'GetTask':
          return await handleGetTask(rpc, runtime, auth.ownerId)
        case 'CancelTask':
          return await handleCancelTask(rpc, runtime, auth.ownerId)
        case 'SubscribeToTask':
          return await handleSubscribeToTask(request, rpc, runtime, auth.ownerId)
        case 'CreateTaskPushNotificationConfig':
        case 'GetTaskPushNotificationConfig':
        case 'ListTaskPushNotificationConfigs':
        case 'DeleteTaskPushNotificationConfig':
          throw new A2AV1ProtocolError(
            A2A_V1_ERROR.pushNotSupported,
            'Push notifications are not supported.',
          )
        case 'GetExtendedAgentCard':
          throw new A2AV1ProtocolError(
            A2A_V1_ERROR.extendedCardNotConfigured,
            'An extended Agent Card is not configured.',
          )
        case 'ListTasks':
          throw new A2AV1ProtocolError(
            A2A_V1_ERROR.unsupported,
            'This operation is not supported.',
          )
      }
    } catch (error) {
      if (!(error instanceof A2AV1ProtocolError)) {
        console.error('[A2A] Request failed', {
          method: rpc.method,
          error: error instanceof Error ? error.message : 'unknown error',
        })
      }
      return protocolResponse(rpc.id, error)
    }
  }
}

export const POST = createA2AV1PostHandler()

async function handleSendMessage(
  rpc: A2AV1JsonRpcRequest,
  runtime: A2AV1Runtime,
  auth: { ownerId: string; keyId: string },
  dependencies: A2AV1RouteDependencies,
): Promise<Response> {
  const params = parseA2AV1SendMessageParams(rpc.params)
  rejectMessageExtensions(params.message.extensions)
  const accepted = await runtime.acceptMessage({
    ownerId: auth.ownerId,
    apiKeyId: auth.keyId,
    params,
  })

  let task = accepted.task
  if (task.status.state === 'TASK_STATE_SUBMITTED') {
    if (params.configuration.returnImmediately) {
      dependencies.schedule(async () => {
        await runtime.executeTask(auth.ownerId, accepted.taskId)
      })
    } else {
      task = await runtime.executeTask(auth.ownerId, accepted.taskId)
    }
  }

  if (!params.configuration.returnImmediately && !isA2AV1TaskSettled(task)) {
    task = await runtime.waitForSettled(auth.ownerId, accepted.taskId, {
      historyLength: params.configuration.historyLength,
    })
  } else if (params.configuration.historyLength !== undefined) {
    task = await runtime.task(
      auth.ownerId,
      accepted.taskId,
      params.configuration.historyLength,
    )
  }

  return successResponse(rpc.id, {
    task: tailorA2AV1Task(task, params.configuration.acceptedOutputModes),
  })
}

async function handleSendStreamingMessage(
  request: Request,
  rpc: A2AV1JsonRpcRequest,
  runtime: A2AV1Runtime,
  auth: { ownerId: string; keyId: string },
): Promise<Response> {
  const params = parseA2AV1SendMessageParams(rpc.params)
  rejectMessageExtensions(params.message.extensions)
  const cursor = eventCursor(request.headers.get('last-event-id'))
  const accepted = await runtime.acceptMessage({
    ownerId: auth.ownerId,
    apiKeyId: auth.keyId,
    params,
  })
  assertCursorWithinTask(cursor, accepted.task)

  return taskStream({
    id: rpc.id,
    ownerId: auth.ownerId,
    taskId: accepted.taskId,
    historyLength: params.configuration.historyLength,
    cursor,
    runtime,
    acceptedOutputModes: params.configuration.acceptedOutputModes,
    executeSubmitted: true,
  })
}

async function handleGetTask(
  rpc: A2AV1JsonRpcRequest,
  runtime: A2AV1Runtime,
  ownerId: string,
): Promise<Response> {
  const params = parseA2AV1TaskQueryParams(rpc.params)
  return successResponse(
    rpc.id,
    await runtime.task(ownerId, params.id, params.historyLength),
  )
}

async function handleCancelTask(
  rpc: A2AV1JsonRpcRequest,
  runtime: A2AV1Runtime,
  ownerId: string,
): Promise<Response> {
  const params = parseA2AV1TaskQueryParams(rpc.params)
  return successResponse(rpc.id, await runtime.cancelTask(ownerId, params.id))
}

async function handleSubscribeToTask(
  request: Request,
  rpc: A2AV1JsonRpcRequest,
  runtime: A2AV1Runtime,
  ownerId: string,
): Promise<Response> {
  const params = parseA2AV1TaskQueryParams(rpc.params)
  const task = await runtime.task(ownerId, params.id, params.historyLength)
  const cursor = eventCursor(request.headers.get('last-event-id'))
  assertCursorWithinTask(cursor, task)
  if (isTerminalSubscriptionState(task.status.state)) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.unsupported,
      'A terminal task cannot be subscribed to.',
    )
  }

  return taskStream({
    id: rpc.id,
    ownerId,
    taskId: params.id,
    historyLength: params.historyLength,
    cursor,
    runtime,
    acceptedOutputModes: undefined,
    executeSubmitted: false,
  })
}

function taskStream(input: {
  id: A2AV1JsonRpcId
  ownerId: string
  taskId: string
  historyLength?: number
  cursor: number
  runtime: A2AV1Runtime
  acceptedOutputModes?: string[]
  executeSubmitted: boolean
}): Response {
  const encoder = new TextEncoder()
  const abortController = new AbortController()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void pumpTaskStream(controller, encoder, {
        ...input,
        signal: abortController.signal,
      })
    },
    cancel() {
      abortController.abort()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: responseHeaders({
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    }),
  })
}

async function pumpTaskStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  input: {
    id: A2AV1JsonRpcId
    ownerId: string
    taskId: string
    historyLength?: number
    cursor: number
    runtime: A2AV1Runtime
    acceptedOutputModes?: string[]
    executeSubmitted: boolean
    signal: AbortSignal
  },
): Promise<void> {
  let cursor = input.cursor
  const deadline = Date.now() + STREAM_DEADLINE_MS
  let nextHeartbeatAt = Date.now() + STREAM_HEARTBEAT_MS
  let execution: Promise<A2AV1TaskSnapshot> | null = null

  try {
    let task = await input.runtime.task(
      input.ownerId,
      input.taskId,
      input.historyLength,
    )
    if (input.executeSubmitted && task.status.state === 'TASK_STATE_SUBMITTED') {
      execution = input.runtime.executeTask(input.ownerId, input.taskId)
      void execution.catch(() => undefined)
    }
    const initial = tailorA2AV1StreamResponse(
      { task },
      input.acceptedOutputModes,
    )
    if (!initial || !writeStream(
      controller,
      encoder,
      sseData(jsonRpcSuccess(input.id, initial)),
    )) {
      if (execution) await execution.catch(() => undefined)
      return
    }

    while (true) {
      if (input.signal.aborted) {
        if (execution) await execution.catch(() => undefined)
        return
      }

      task = await input.runtime.task(
        input.ownerId,
        input.taskId,
        input.historyLength,
      )
      const latestSequence = taskEventSequence(task)
      if (latestSequence > cursor) {
        const events = await input.runtime.eventsAfter(
          input.ownerId,
          input.taskId,
          cursor,
        )
        for (const event of events) {
          cursor = event.sequence
          const tailored = tailorA2AV1StreamResponse(
            event.payload,
            input.acceptedOutputModes,
          )
          if (!tailored) continue
          if (!writeStream(
            controller,
            encoder,
            sseData(jsonRpcSuccess(input.id, tailored), event.sequence),
          )) {
            if (execution) await execution.catch(() => undefined)
            return
          }
        }
      }

      if (isA2AV1TaskSettled(task) && cursor >= latestSequence) {
        if (execution) await execution.catch(() => undefined)
        closeStream(controller)
        return
      }
      if (Date.now() >= deadline) {
        closeStream(controller)
        return
      }
      if (Date.now() >= nextHeartbeatAt) {
        if (!writeStream(controller, encoder, ': keep-alive\n\n')) {
          if (execution) await execution.catch(() => undefined)
          return
        }
        nextHeartbeatAt = Date.now() + STREAM_HEARTBEAT_MS
      }
      await sleep(300)
    }
  } catch (error) {
    if (input.signal.aborted) return
    writeStream(
      controller,
      encoder,
      sseData(jsonRpcError(input.id, asProtocolError(error))),
    )
    closeStream(controller)
  }
}

function writeStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  value: string,
): boolean {
  try {
    controller.enqueue(encoder.encode(value))
    return true
  } catch {
    return false
  }
}

function closeStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  try {
    controller.close()
  } catch {
    // The consumer may already have canceled the stream.
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidRequest,
      'Request body is too large.',
      undefined,
      413,
    )
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.parse,
      'Request body is required.',
    )
  }

  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.invalidRequest,
        'Request body is too large.',
        undefined,
        413,
      )
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  if (!text.trim()) {
    throw new A2AV1ProtocolError(A2A_V1_ERROR.parse, 'Request body is required.')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new A2AV1ProtocolError(A2A_V1_ERROR.parse, 'Invalid JSON payload.')
  }
}

function rejectUnsupportedExtensions(value: string | null): void {
  if (!value?.trim()) return
  throw new A2AV1ProtocolError(
    A2A_V1_ERROR.extensionSupportRequired,
    'A2A extensions are not enabled for this endpoint.',
  )
}

function rejectMessageExtensions(extensions?: string[]): void {
  if (!extensions?.length) return
  throw new A2AV1ProtocolError(
    A2A_V1_ERROR.extensionSupportRequired,
    'Message extensions are not enabled for this endpoint.',
  )
}

function isTerminalSubscriptionState(state: string): boolean {
  return [
    'TASK_STATE_COMPLETED',
    'TASK_STATE_FAILED',
    'TASK_STATE_CANCELED',
    'TASK_STATE_REJECTED',
  ].includes(state)
}

function assertCursorWithinTask(
  cursor: number,
  task: A2AV1TaskSnapshot,
): void {
  if (cursor <= taskEventSequence(task)) return
  throw new A2AV1ProtocolError(
    A2A_V1_ERROR.invalidParams,
    'Last-Event-ID is beyond the task event stream.',
  )
}

function eventCursor(value: string | null): number {
  if (!value?.trim()) return 0
  const cursor = Number(value)
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'Last-Event-ID must be a non-negative integer.',
    )
  }
  return cursor
}

function jsonRpcId(value: unknown): A2AV1JsonRpcId {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = (value as Record<string, unknown>).id
  if (id === null) return null
  if (typeof id === 'string') return id.length > 0 && id.length <= 200 ? id : null
  return typeof id === 'number' && Number.isSafeInteger(id) ? id : null
}

function jsonRpcSuccess(id: A2AV1JsonRpcId, result: unknown) {
  return { jsonrpc: '2.0' as const, id, result }
}

function successResponse(id: A2AV1JsonRpcId, result: unknown): Response {
  return jsonResponse(jsonRpcSuccess(id, result))
}

function authenticationResponse(
  id: A2AV1JsonRpcId,
  message: string,
  status: number,
): Response {
  const error = new A2AV1ProtocolError(AUTH_ERROR_CODE, message, undefined, status)
  return protocolResponse(
    id,
    error,
    status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined,
  )
}

function rateLimitResponse(
  id: A2AV1JsonRpcId,
  limited: Response,
): Response {
  const retryAfter = limited.headers.get('retry-after')
  const error = new A2AV1ProtocolError(
    RATE_LIMIT_ERROR_CODE,
    'Rate limit exceeded.',
    retryAfter
      ? [{
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: `${retryAfter}s`,
        }]
      : undefined,
    429,
  )
  return protocolResponse(
    id,
    error,
    retryAfter ? { 'Retry-After': retryAfter } : undefined,
  )
}

function normalizeReadError(error: unknown): A2AV1ProtocolError {
  if (error instanceof A2AV1ProtocolError) return error
  return new A2AV1ProtocolError(A2A_V1_ERROR.parse, 'Invalid request body.')
}

function asProtocolError(error: unknown): A2AV1ProtocolError {
  if (error instanceof A2AV1ProtocolError) return error
  return new A2AV1ProtocolError(
    A2A_V1_ERROR.internal,
    'Internal server error.',
    undefined,
    500,
  )
}

function protocolResponse(
  id: A2AV1JsonRpcId,
  error: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  const protocolError = asProtocolError(error)
  return jsonResponse(
    jsonRpcError(id, protocolError),
    protocolError.httpStatus,
    extraHeaders,
  )
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    }),
  })
}

function responseHeaders(extra: Record<string, string>): Headers {
  const headers = new Headers({
    'A2A-Version': A2A_V1_PROTOCOL_VERSION,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Authorization, A2A-Version, A2A-Extensions',
    ...extra,
  })
  return headers
}

function sseData(payload: unknown, sequence?: number): string {
  return `${sequence === undefined ? '' : `id: ${sequence}\n`}data: ${JSON.stringify(payload)}\n\n`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
