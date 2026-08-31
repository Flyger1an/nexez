import { describe, expect, it, vi } from 'vitest'
import { A2A_ERROR } from '../../../lib/a2a/protocol'
import { createA2APostHandler } from './route'

const ownerId = '11111111-1111-4111-8111-111111111111'
const keyId = '22222222-2222-4222-8222-222222222222'
const taskId = '33333333-3333-4333-8333-333333333333'
const contextId = '44444444-4444-4444-8444-444444444444'

const task = (state: string) => ({
  kind: 'task' as const,
  id: taskId,
  contextId,
  status: { state },
  metadata: { 'nexez:eventSequence': 0 },
})

const request = (method: string, params: unknown, headers: Record<string, string> = {}) =>
  new Request('https://nexez.app/api/a2a', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'rpc-1', method, params }),
  })

const sendParams = (blocking = false) => ({
  message: {
    kind: 'message',
    role: 'user',
    messageId: 'message-1',
    parts: [{ kind: 'text', text: 'Find a cleaner.' }],
  },
  configuration: { blocking },
})

const dependencies = (runtime: Record<string, any>, overrides: Record<string, any> = {}) => ({
  authenticate: vi.fn(async () => ({ ok: true, ownerId, keyId })),
  rateLimit: vi.fn(async () => null),
  runtime: () => runtime,
  streamingEnabled: () => true,
  schedule: vi.fn(),
  ...overrides,
})

async function ssePayloads(response: Response): Promise<any[]> {
  return (await response.text())
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const data = block.split('\n').find((line) => line.startsWith('data:'))!
      return JSON.parse(data.slice(5).trim())
    })
}

describe('POST /api/a2a', () => {
  it('rejects non-JSON content before authentication', async () => {
    const deps = dependencies({})
    const handler = createA2APostHandler(deps as any)
    const response = await handler(new Request('https://nexez.app/api/a2a', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    }))

    expect(response.status).toBe(415)
    expect(await response.json()).toMatchObject({
      id: null,
      error: { code: A2A_ERROR.contentTypeNotSupported },
    })
    expect(deps.authenticate).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies before parsing or authentication', async () => {
    const deps = dependencies({})
    const handler = createA2APostHandler(deps as any)
    const response = await handler(new Request('https://nexez.app/api/a2a', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '64001',
      },
      body: '{}',
    }))

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({
      id: null,
      error: { code: A2A_ERROR.invalidRequest },
    })
    expect(deps.authenticate).not.toHaveBeenCalled()
  })

  it('returns a JSON-RPC rate-limit error instead of leaking a plain application response', async () => {
    const limited = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'retry-after': '9' },
    })
    const handler = createA2APostHandler(dependencies({}, {
      rateLimit: vi.fn(async () => limited),
    }) as any)

    const response = await handler(request('tasks/get', { id: taskId }))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      id: 'rpc-1',
      error: {
        code: A2A_ERROR.server,
        message: 'Rate limit exceeded.',
        data: { retryAfterSeconds: 9 },
      },
    })
  })

  it('fails the stream route closed when the shared capability switch is disabled', async () => {
    const handler = createA2APostHandler(dependencies({}, {
      streamingEnabled: () => false,
    }) as any)

    const response = await handler(request('message/stream', sendParams()))
    expect(await response.json()).toMatchObject({
      error: { code: A2A_ERROR.unsupported },
    })
  })

  it('waits for a duplicate blocking send that is already working', async () => {
    const runtime = {
      acceptMessage: vi.fn(async () => ({
        outcome: 'duplicate', taskId, task: task('working'),
      })),
      executeTask: vi.fn(),
      waitForSettled: vi.fn(async () => task('completed')),
      task: vi.fn(async () => task('completed')),
    }
    const handler = createA2APostHandler(dependencies(runtime) as any)

    const response = await handler(request('message/send', sendParams(true)))
    expect((await response.json()).result.status.state).toBe('completed')
    expect(runtime.waitForSettled).toHaveBeenCalledWith(ownerId, taskId, expect.any(Object))
    expect(runtime.executeTask).not.toHaveBeenCalled()
  })

  it('schedules a non-blocking submitted task after returning its durable handle', async () => {
    const runtime = {
      acceptMessage: vi.fn(async () => ({
        outcome: 'created', taskId, task: task('submitted'),
      })),
      executeTask: vi.fn(async () => task('completed')),
      task: vi.fn(async () => task('submitted')),
    }
    const deps = dependencies(runtime)
    const handler = createA2APostHandler(deps as any)

    const response = await handler(request('message/send', sendParams(false)))
    expect((await response.json()).result.status.state).toBe('submitted')
    expect(deps.schedule).toHaveBeenCalledTimes(1)
  })

  it('emits the Task as the first complete JSON-RPC SSE payload', async () => {
    const runtime = {
      acceptMessage: vi.fn(async () => ({
        outcome: 'duplicate', taskId, task: task('completed'),
      })),
      task: vi.fn(async () => task('completed')),
      eventsAfter: vi.fn(async () => []),
      executeTask: vi.fn(),
    }
    const handler = createA2APostHandler(dependencies(runtime) as any)

    const response = await handler(request('message/stream', sendParams()))
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const payloads = await ssePayloads(response)
    expect(payloads[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 'rpc-1',
      result: { kind: 'task', id: taskId },
    })
    expect(runtime.eventsAfter).not.toHaveBeenCalled()
  })
})
