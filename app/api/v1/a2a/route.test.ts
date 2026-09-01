import { describe, expect, it, vi } from 'vitest'
import { A2A_V1_ERROR } from '../../../../lib/a2a/v1/protocol'
import { createA2AV1PostHandler } from './route'

const ownerId = '10000000-0000-4000-8000-000000000001'
const keyId = '20000000-0000-4000-8000-000000000001'
const taskId = '30000000-0000-4000-8000-000000000001'
const contextId = 'buyer-context'

function task(state: string, sequence = 0) {
  return {
    id: taskId,
    contextId,
    status: { state },
    metadata: { 'nexez:eventSequence': sequence },
  }
}

function request(
  method: string,
  params: unknown,
  options: { headers?: Record<string, string>; id?: string | number | null } = {},
) {
  return new Request('https://nexez.app/api/v1/a2a', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'a2a-version': '1.0',
      authorization: 'Bearer nxz_live_test',
      ...options.headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: options.id ?? 'rpc-1',
      method,
      params,
    }),
  })
}

const sendParams = (returnImmediately = false) => ({
  message: {
    messageId: 'message-1',
    role: 'ROLE_USER',
    parts: [{ text: 'Find a cleaner.' }],
  },
  configuration: { returnImmediately },
})

function dependencies(runtime: Record<string, any>, overrides: Record<string, any> = {}) {
  return {
    authenticate: vi.fn(async () => ({ ok: true, ownerId, keyId })),
    rateLimit: vi.fn(async () => null),
    runtime: () => runtime,
    schedule: vi.fn(),
    ...overrides,
  }
}

async function ssePayloads(response: Response) {
  return (await response.text())
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const data = block.split('\n').find((line) => line.startsWith('data:'))!
      return {
        id: block.split('\n').find((line) => line.startsWith('id:'))?.slice(3).trim(),
        payload: JSON.parse(data.slice(5).trim()),
      }
    })
}

describe('POST /api/v1/a2a', () => {
  it('rejects non-JSON input before authentication', async () => {
    const deps = dependencies({})
    const handler = createA2AV1PostHandler(deps as any)
    const response = await handler(new Request('https://nexez.app/api/v1/a2a', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    }))

    expect(response.status).toBe(415)
    expect(await response.json()).toMatchObject({
      id: null,
      error: { code: A2A_V1_ERROR.contentTypeNotSupported },
    })
    expect(deps.authenticate).not.toHaveBeenCalled()
  })

  it('requires explicit A2A v1 negotiation', async () => {
    const deps = dependencies({})
    const handler = createA2AV1PostHandler(deps as any)
    const response = await handler(request('GetTask', { id: taskId }, {
      headers: { 'a2a-version': '' },
    }))

    expect(await response.json()).toMatchObject({
      id: 'rpc-1',
      error: { code: A2A_V1_ERROR.versionNotSupported },
    })
    expect(deps.authenticate).not.toHaveBeenCalled()
  })

  it('fails closed when an unsupported extension is requested', async () => {
    const deps = dependencies({})
    const handler = createA2AV1PostHandler(deps as any)
    const response = await handler(request('GetTask', { id: taskId }, {
      headers: { 'a2a-extensions': 'urn:example:required' },
    }))

    expect(await response.json()).toMatchObject({
      error: { code: A2A_V1_ERROR.extensionSupportRequired },
    })
    expect(deps.authenticate).not.toHaveBeenCalled()
  })

  it('returns authentication and rate-limit failures as JSON-RPC envelopes', async () => {
    const authTelemetry = vi.fn()
    const unauthenticated = createA2AV1PostHandler(dependencies({}, {
      authenticate: vi.fn(async () => ({ ok: false, error: 'Invalid API key.', status: 401 })),
      telemetry: authTelemetry,
    }) as any)
    const authResponse = await unauthenticated(request('GetTask', { id: taskId }))
    expect(authResponse.status).toBe(401)
    expect(authResponse.headers.get('www-authenticate')).toBe('Bearer')
    expect(await authResponse.json()).toMatchObject({
      id: 'rpc-1',
      error: { code: -32000, message: 'Invalid API key.' },
    })
    expect(authTelemetry).toHaveBeenCalledWith('a2a.v1.auth.denied', {
      method: 'GetTask',
      resultClass: 'authentication_denied',
      errorClass: 'invalid_key',
    })

    const limited = new Response('limited', {
      status: 429,
      headers: { 'retry-after': '9' },
    })
    const rateTelemetry = vi.fn()
    const rateLimited = createA2AV1PostHandler(dependencies({}, {
      rateLimit: vi.fn(async () => limited),
      telemetry: rateTelemetry,
    }) as any)
    const rateResponse = await rateLimited(request('GetTask', { id: taskId }))
    expect(rateResponse.status).toBe(429)
    expect(rateResponse.headers.get('retry-after')).toBe('9')
    expect(await rateResponse.json()).toMatchObject({ error: { code: -32029 } })
    expect(rateTelemetry).toHaveBeenCalledWith('a2a.v1.rate_limited', { scope: 'ip' })
  })

  it('distinguishes revoked keys from entitlement denials without recording identity', async () => {
    const revokedTelemetry = vi.fn()
    const revoked = createA2AV1PostHandler(dependencies({}, {
      authenticate: vi.fn(async () => ({
        ok: false,
        error: 'This API key has been revoked.',
        status: 401,
      })),
      telemetry: revokedTelemetry,
    }) as any)
    await revoked(request('GetTask', { id: taskId }))
    expect(revokedTelemetry).toHaveBeenCalledWith('a2a.v1.auth.denied', {
      method: 'GetTask',
      resultClass: 'authentication_denied',
      errorClass: 'revoked_key',
    })

    const entitlementTelemetry = vi.fn()
    const entitlement = createA2AV1PostHandler(dependencies({}, {
      authenticate: vi.fn(async () => ({
        ok: false,
        error: 'API access requires the Pro plan.',
        status: 402,
      })),
      telemetry: entitlementTelemetry,
    }) as any)
    await entitlement(request('GetTask', { id: taskId }))
    expect(entitlementTelemetry).toHaveBeenCalledWith('a2a.v1.auth.denied', {
      method: 'GetTask',
      resultClass: 'entitlement_denied',
      errorClass: 'entitlement_denied',
    })
  })

  it('executes a blocking SendMessage and returns the settled task', async () => {
    const runtime = {
      acceptMessage: vi.fn(async () => ({
        outcome: 'created',
        taskId,
        task: task('TASK_STATE_SUBMITTED'),
      })),
      executeTask: vi.fn(async () => task('TASK_STATE_COMPLETED', 3)),
      waitForSettled: vi.fn(),
      task: vi.fn(),
    }
    const handler = createA2AV1PostHandler(dependencies(runtime) as any)
    const response = await handler(request('SendMessage', sendParams()))

    expect(await response.json()).toMatchObject({
      result: { task: { id: taskId, status: { state: 'TASK_STATE_COMPLETED' } } },
    })
    expect(runtime.executeTask).toHaveBeenCalledWith(ownerId, taskId)
    expect(runtime.waitForSettled).not.toHaveBeenCalled()
  })

  it('schedules returnImmediately work after returning the durable task handle', async () => {
    const runtime = {
      acceptMessage: vi.fn(async () => ({
        outcome: 'created',
        taskId,
        task: task('TASK_STATE_SUBMITTED'),
      })),
      executeTask: vi.fn(async () => task('TASK_STATE_COMPLETED', 3)),
      task: vi.fn(),
    }
    const deps = dependencies(runtime)
    const handler = createA2AV1PostHandler(deps as any)
    const response = await handler(request('SendMessage', sendParams(true)))

    expect(await response.json()).toMatchObject({
      result: { task: { status: { state: 'TASK_STATE_SUBMITTED' } } },
    })
    expect(deps.schedule).toHaveBeenCalledTimes(1)
    expect(runtime.executeTask).not.toHaveBeenCalled()
  })

  it('catches runtime construction failures inside the JSON-RPC boundary', async () => {
    const handler = createA2AV1PostHandler(dependencies({}, {
      runtime: () => {
        throw new Error('missing private runtime configuration')
      },
    }) as any)
    const response = await handler(request('GetTask', { id: taskId }))

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      error: {
        code: A2A_V1_ERROR.internal,
        message: 'Internal server error.',
      },
    })
  })

  it('catches asynchronous handler failures inside the JSON-RPC boundary', async () => {
    const runtime = {
      task: vi.fn(async () => {
        throw new Error('private database detail')
      }),
    }
    const handler = createA2AV1PostHandler(dependencies(runtime) as any)
    const response = await handler(request('GetTask', { id: taskId }))

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      error: {
        code: A2A_V1_ERROR.internal,
        message: 'Internal server error.',
      },
    })
  })

  it('returns GetTask and CancelTask through the owner-bound runtime', async () => {
    const runtime = {
      task: vi.fn(async () => task('TASK_STATE_WORKING', 1)),
      cancelTask: vi.fn(async () => task('TASK_STATE_CANCELED', 2)),
    }
    const handler = createA2AV1PostHandler(dependencies(runtime) as any)

    const getResponse = await handler(request('GetTask', { id: taskId, historyLength: 2 }))
    expect(await getResponse.json()).toMatchObject({
      result: { status: { state: 'TASK_STATE_WORKING' } },
    })
    expect(runtime.task).toHaveBeenCalledWith(ownerId, taskId, 2)

    const cancelResponse = await handler(request('CancelTask', { id: taskId }))
    expect(await cancelResponse.json()).toMatchObject({
      result: { status: { state: 'TASK_STATE_CANCELED' } },
    })
    expect(runtime.cancelTask).toHaveBeenCalledWith(ownerId, taskId)
  })

  it('streams a Task first, then ordered durable events after Last-Event-ID', async () => {
    const completed = task('TASK_STATE_COMPLETED', 3)
    const statusEvent = {
      statusUpdate: {
        taskId,
        contextId,
        status: { state: 'TASK_STATE_COMPLETED' },
      },
    }
    const runtime = {
      acceptMessage: vi.fn(async () => ({
        outcome: 'duplicate',
        taskId,
        task: completed,
      })),
      task: vi.fn(async () => completed),
      eventsAfter: vi.fn(async () => [{
        sequence: 3,
        eventId: '40000000-0000-4000-8000-000000000003',
        eventKind: 'status_update',
        payload: statusEvent,
        createdAt: '2026-09-01T04:00:00.000Z',
      }]),
      executeTask: vi.fn(),
    }
    const telemetry = vi.fn()
    const handler = createA2AV1PostHandler(dependencies(runtime, { telemetry }) as any)
    const response = await handler(request('SendStreamingMessage', sendParams(), {
      headers: { 'last-event-id': '2' },
    }))

    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('a2a-version')).toBe('1.0')
    const events = await ssePayloads(response)
    expect(events[0]).toMatchObject({
      payload: { result: { task: { id: taskId } } },
    })
    expect(events[1]).toMatchObject({
      id: '3',
      payload: { result: statusEvent },
    })
    expect(runtime.eventsAfter).toHaveBeenCalledWith(ownerId, taskId, 2)
    expect(runtime.executeTask).not.toHaveBeenCalled()
    expect(telemetry).toHaveBeenCalledWith('a2a.v1.sse.connected', {
      method: 'SendStreamingMessage',
      resultClass: 'resume',
    })
    expect(telemetry).toHaveBeenCalledWith('a2a.v1.sse.resumed', {
      method: 'SendStreamingMessage',
      eventSequence: 2,
    })
  })

  it('records a future SSE cursor as a bounded protocol event', async () => {
    const runtime = {
      acceptMessage: vi.fn(async () => ({
        outcome: 'duplicate',
        taskId,
        task: task('TASK_STATE_WORKING', 2),
      })),
    }
    const telemetry = vi.fn()
    const handler = createA2AV1PostHandler(dependencies(runtime, { telemetry }) as any)
    const response = await handler(request('SendStreamingMessage', sendParams(), {
      headers: { 'last-event-id': '3' },
    }))

    expect(response.status).toBe(400)
    expect(telemetry).toHaveBeenCalledWith('a2a.v1.sse.invalid_cursor', {
      method: 'SendStreamingMessage',
      resultClass: 'future_cursor',
      eventSequence: 3,
    })
  })

  it('rejects subscriptions to settled tasks and unsupported method families', async () => {
    const runtime = {
      task: vi.fn(async () => task('TASK_STATE_COMPLETED', 3)),
    }
    const handler = createA2AV1PostHandler(dependencies(runtime) as any)

    const subscribed = await handler(request('SubscribeToTask', { id: taskId }))
    expect(await subscribed.json()).toMatchObject({
      error: { code: A2A_V1_ERROR.unsupported },
    })

    const push = await handler(request('CreateTaskPushNotificationConfig', {}))
    expect(await push.json()).toMatchObject({
      error: { code: A2A_V1_ERROR.pushNotSupported },
    })

    const list = await handler(request('ListTasks', {}))
    expect(await list.json()).toMatchObject({
      error: { code: A2A_V1_ERROR.unsupported },
    })
  })
})
