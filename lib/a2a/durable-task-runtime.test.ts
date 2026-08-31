import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NexieTurnResult } from '../agents/nexie'
import { DurableA2ARuntime } from './durable-task-runtime'
import type { DurableA2ATaskStore, A2ATaskRow } from './durable-task-store'

const ownerId = '11111111-1111-4111-8111-111111111111'
const taskId = '22222222-2222-4222-8222-222222222222'
const contextId = '33333333-3333-4333-8333-333333333333'
const executionToken = '44444444-4444-4444-8444-444444444444'

const row = (state: A2ATaskRow['state']): A2ATaskRow => ({
  id: taskId,
  owner_id: ownerId,
  api_key_id: '55555555-5555-4555-8555-555555555555',
  context_id: contextId,
  nexie_thread_id: null,
  state,
  status_message: null,
  artifacts: [],
  history: [{
    kind: 'message',
    role: 'user',
    messageId: 'message-1',
    taskId,
    contextId,
    parts: [{ kind: 'text', text: 'Find a cleaner.' }],
  }],
  metadata: {},
  safe_error_code: null,
  safe_error_message: null,
  execution_token: state === 'working' ? executionToken : null,
  execution_attempts: state === 'working' ? 1 : 0,
  claimed_at: state === 'working' ? new Date().toISOString() : null,
  lease_expires_at: state === 'working' ? new Date(Date.now() + 30_000).toISOString() : null,
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_event_sequence: 0,
})

const result: NexieTurnResult = {
  threadId: '66666666-6666-4666-8666-666666666666',
  agentId: '77777777-7777-4777-8777-777777777777',
  message: 'Found one.',
  cards: [],
  suggestions: [],
  toolsUsed: ['search_pages'],
  memory: {},
  model: { configured: true, provider: 'test', name: 'test' },
}

describe('DurableA2ARuntime', () => {
  it('does not execute again when another worker already owns the claim', async () => {
    const store = {
      reconcileTask: vi.fn(),
      claimTask: vi.fn(async () => ({ claimed: false, taskId, contextId })),
      getTask: vi.fn(async () => ({
        kind: 'task', id: taskId, contextId, status: { state: 'working' },
      })),
    }
    const executor = vi.fn()
    const runtime = new DurableA2ARuntime(
      {} as SupabaseClient,
      store as unknown as DurableA2ATaskStore,
      executor as any,
    )

    expect((await runtime.executeTask(ownerId, taskId)).status.state).toBe('working')
    expect(executor).not.toHaveBeenCalled()
  })

  it('persists projector events in order before returning the final task', async () => {
    let current = row('submitted')
    const appendEvent = vi.fn(async ({ event }: any) => {
      current = {
        ...current,
        state: event.kind === 'status-update' ? event.status.state : current.state,
        artifacts: event.kind === 'artifact-update' ? [event.artifact] : current.artifacts,
        execution_token: event.kind === 'status-update' && event.final ? null : executionToken,
      }
      return { sequence: appendEvent.mock.calls.length, duplicate: false }
    })
    const store = {
      reconcileTask: vi.fn(),
      claimTask: vi.fn(async () => ({ claimed: true, taskId, contextId, executionToken })),
      getTaskRow: vi.fn(async () => current),
      appendEvent,
      failExecution: vi.fn(),
      getTask: vi.fn(async () => ({
        kind: 'task', id: taskId, contextId, status: { state: current.state }, artifacts: current.artifacts ?? [],
      })),
    }
    const executor = vi.fn(async (_input: any, emit: any) => {
      await emit({ type: 'text-delta', delta: 'Found ', source: 'model' })
      await emit({ type: 'completed', result })
      return result
    })
    const runtime = new DurableA2ARuntime(
      {} as SupabaseClient,
      store as unknown as DurableA2ATaskStore,
      executor as any,
    )

    const task = await runtime.executeTask(ownerId, taskId)
    expect(appendEvent.mock.calls.map(([call]: [any]) => call.event.kind)).toEqual([
      'artifact-update',
      'artifact-update',
      'status-update',
    ])
    expect(task.status.state).toBe('completed')
    expect(store.failExecution).not.toHaveBeenCalled()
  })

  it('coalesces model tokens before writing progressive ledger events', async () => {
    let current = row('submitted')
    const appendEvent = vi.fn(async ({ event }: any) => {
      current = {
        ...current,
        state: event.kind === 'status-update' ? event.status.state : current.state,
        execution_token: event.kind === 'status-update' && event.final ? null : executionToken,
      }
      return { sequence: appendEvent.mock.calls.length, duplicate: false }
    })
    const store = {
      reconcileTask: vi.fn(),
      claimTask: vi.fn(async () => ({ claimed: true, taskId, contextId, executionToken })),
      getTaskRow: vi.fn(async () => current),
      appendEvent,
      failExecution: vi.fn(),
      getTask: vi.fn(async () => ({
        kind: 'task', id: taskId, contextId, status: { state: current.state },
      })),
    }
    const executor = vi.fn(async (_input: any, emit: any) => {
      for (let index = 0; index < 100; index += 1) {
        await emit({ type: 'text-delta', delta: 'token ', source: 'model' })
      }
      await emit({ type: 'completed', result })
      return result
    })
    const runtime = new DurableA2ARuntime(
      {} as SupabaseClient,
      store as unknown as DurableA2ATaskStore,
      executor as any,
    )

    await runtime.executeTask(ownerId, taskId)
    const previewWrites = appendEvent.mock.calls
      .map(([call]: [any]) => call.event)
      .filter((event: any) => event.kind === 'artifact-update' && event.lastChunk === false)
    expect(previewWrites.length).toBeLessThan(10)
  })

  it('stores only a safe failure when Nexxi execution throws', async () => {
    const store = {
      reconcileTask: vi.fn(),
      claimTask: vi.fn(async () => ({ claimed: true, taskId, contextId, executionToken })),
      getTaskRow: vi.fn(async () => row('working')),
      appendEvent: vi.fn(),
      failExecution: vi.fn(),
      getTask: vi.fn(async () => ({
        kind: 'task', id: taskId, contextId, status: { state: 'failed' },
      })),
    }
    const runtime = new DurableA2ARuntime(
      {} as SupabaseClient,
      store as unknown as DurableA2ATaskStore,
      vi.fn(async () => { throw new Error('private provider detail') }) as any,
    )

    await runtime.executeTask(ownerId, taskId)
    expect(store.failExecution).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'nexxi_execution_failed',
      errorMessage: expect.not.stringContaining('private provider detail'),
    }))
  })
})
