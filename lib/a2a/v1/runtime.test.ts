import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NexieTurnResult } from '../../agents/nexie'
import { A2AV1Runtime } from './runtime'
import { A2A_V1_ERROR, parseA2AV1SendMessageParams } from './protocol'
import type { A2AV1TaskStore, A2AV1TaskSnapshot } from './task-store'

const ownerId = '10000000-0000-4000-8000-000000000001'
const taskId = '30000000-0000-4000-8000-000000000001'
const contextId = 'buyer-context'
const executionToken = '40000000-0000-4000-8000-000000000001'

function task(
  state: A2AV1TaskSnapshot['status']['state'],
  sequence = 0,
): A2AV1TaskSnapshot {
  return {
    id: taskId,
    contextId,
    status: { state },
    metadata: { 'nexez:eventSequence': sequence },
  }
}

const result: NexieTurnResult = {
  threadId: '50000000-0000-4000-8000-000000000001',
  agentId: '60000000-0000-4000-8000-000000000001',
  message: 'Found one.',
  cards: [],
  suggestions: ['Compare it'],
  toolsUsed: ['search_pages'],
  memory: {},
  model: { configured: true, provider: 'test', name: 'test-model' },
}

function executionContext() {
  return {
    taskId,
    contextId,
    nexieThreadId: null,
    history: [{
      messageId: 'message-1',
      taskId,
      contextId,
      role: 'ROLE_USER',
      parts: [{ text: 'Find a cleaner.' }],
    }],
    metadata: {},
    leaseExpiresAt: '2026-09-01T05:00:00.000Z',
  }
}

describe('A2AV1Runtime', () => {
  it('records claim delay and a lost claim race without task identity', async () => {
    const store = {
      acceptMessage: vi.fn(async () => ({ outcome: 'created', taskId })),
      reconcileTask: vi.fn(async () => ({ reconciled: false })),
      getTask: vi.fn(async () => task('TASK_STATE_WORKING', 1)),
      claimTask: vi.fn(async () => ({
        claimed: false,
        outcome: 'task_not_submitted',
        state: 'TASK_STATE_WORKING',
      })),
    }
    const telemetry = vi.fn()
    const runtime = new A2AV1Runtime(
      {} as SupabaseClient,
      store as unknown as A2AV1TaskStore,
      vi.fn() as any,
      async () => null,
      () => '70000000-0000-4000-8000-000000000001',
      telemetry,
    )
    const params = parseA2AV1SendMessageParams({
      message: {
        messageId: 'message-1',
        role: 'ROLE_USER',
        parts: [{ text: 'Find a cleaner.' }],
      },
    })

    await runtime.acceptMessage({ ownerId, apiKeyId: 'key-1', params })
    await runtime.executeTask(ownerId, taskId)

    expect(telemetry).toHaveBeenCalledWith('a2a.v1.task.claim_lost', {
      taskState: 'TASK_STATE_WORKING',
      resultClass: 'task_not_submitted',
      durationMs: expect.any(Number),
    })
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain(taskId)
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain(ownerId)
  })

  it('maps a conflicting message receipt into a bounded protocol error', async () => {
    const store = {
      acceptMessage: vi.fn(async () => ({ outcome: 'conflict' })),
    }
    const runtime = new A2AV1Runtime(
      {} as SupabaseClient,
      store as unknown as A2AV1TaskStore,
    )
    const params = parseA2AV1SendMessageParams({
      message: {
        messageId: 'message-1',
        role: 'ROLE_USER',
        parts: [{ text: 'Find a cleaner.' }],
      },
    })

    await expect(runtime.acceptMessage({ ownerId, apiKeyId: 'key-1', params }))
      .rejects.toMatchObject({
        code: A2A_V1_ERROR.invalidParams,
        httpStatus: 409,
      })
  })

  it('fails quickly when the originating API key is revoked before claim', async () => {
    const store = {
      reconcileTask: vi.fn(async () => ({ reconciled: false })),
      claimTask: vi.fn(async () => ({ claimed: false, outcome: 'api_key_invalid' })),
      getTask: vi.fn(),
    }
    const executeNexie = vi.fn()
    const runtime = new A2AV1Runtime(
      {} as SupabaseClient,
      store as unknown as A2AV1TaskStore,
      executeNexie as any,
    )

    await expect(runtime.executeTask(ownerId, taskId)).rejects.toMatchObject({
      code: A2A_V1_ERROR.invalidRequest,
      httpStatus: 401,
    })
    expect(store.getTask).not.toHaveBeenCalled()
    expect(executeNexie).not.toHaveBeenCalled()
  })

  it('does not execute twice when another worker owns the claim', async () => {
    const store = {
      reconcileTask: vi.fn(async () => ({ reconciled: false })),
      claimTask: vi.fn(async () => ({ claimed: false, outcome: 'task_not_submitted' })),
      getTask: vi.fn(async () => task('TASK_STATE_WORKING', 1)),
    }
    const executeNexie = vi.fn()
    const runtime = new A2AV1Runtime(
      {} as SupabaseClient,
      store as unknown as A2AV1TaskStore,
      executeNexie as any,
    )

    await expect(runtime.executeTask(ownerId, taskId)).resolves.toMatchObject({
      status: { state: 'TASK_STATE_WORKING' },
    })
    expect(executeNexie).not.toHaveBeenCalled()
  })

  it('persists buffered previews before the authoritative artifact and status', async () => {
    let state: A2AV1TaskSnapshot['status']['state'] = 'TASK_STATE_WORKING'
    let sequence = 1
    const events: any[] = []
    const store = {
      reconcileTask: vi.fn(async () => ({ reconciled: false })),
      claimTask: vi.fn(async () => ({
        claimed: true,
        outcome: 'claimed',
        taskId,
        contextId,
        executionToken,
      })),
      getExecutionContext: vi.fn(async () => executionContext()),
      appendEvent: vi.fn(async ({ event }: any) => {
        events.push(event)
        sequence += 1
        if ('statusUpdate' in event) state = event.statusUpdate.status.state
        return { sequence, duplicate: false, settled: 'statusUpdate' in event }
      }),
      failExecution: vi.fn(),
      getTask: vi.fn(async () => task(state, sequence)),
    }
    const executeNexie = vi.fn(async (input: any, emit: (event: any) => void) => {
      for (let index = 0; index < 100; index += 1) {
        emit({ type: 'text-delta', delta: 'token ', source: 'model' })
      }
      emit({ type: 'completed', result })
      return result
    })
    let nextId = 0
    const runtime = new A2AV1Runtime(
      {} as SupabaseClient,
      store as unknown as A2AV1TaskStore,
      executeNexie as any,
      async () => 'buyer@example.com',
      () => `70000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    )

    await expect(runtime.executeTask(ownerId, taskId)).resolves.toMatchObject({
      status: { state: 'TASK_STATE_COMPLETED' },
    })

    const previewEvents = events.filter(
      (event) => 'artifactUpdate' in event && event.artifactUpdate.lastChunk === false,
    )
    expect(previewEvents.length).toBeGreaterThan(0)
    expect(previewEvents.length).toBeLessThan(10)
    expect(events.at(-2)).toMatchObject({
      artifactUpdate: {
        lastChunk: true,
        metadata: { 'nexez:messageId': expect.any(String) },
        artifact: {
          metadata: { 'nexez:authoritative': true },
        },
      },
    })
    expect(events.at(-1)).toMatchObject({
      statusUpdate: { status: { state: 'TASK_STATE_COMPLETED' } },
    })
    expect(executeNexie).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ownerId,
        userEmail: 'buyer@example.com',
        message: 'Find a cleaner.',
        approval: null,
      }),
      expect.any(Function),
    )
    expect(store.failExecution).not.toHaveBeenCalled()
  })

  it('stores only a safe external failure when execution throws', async () => {
    let state: A2AV1TaskSnapshot['status']['state'] = 'TASK_STATE_WORKING'
    const store = {
      reconcileTask: vi.fn(async () => ({ reconciled: false })),
      claimTask: vi.fn(async () => ({
        claimed: true,
        outcome: 'claimed',
        taskId,
        contextId,
        executionToken,
      })),
      getExecutionContext: vi.fn(async () => executionContext()),
      appendEvent: vi.fn(),
      failExecution: vi.fn(async () => {
        state = 'TASK_STATE_FAILED'
        return { stored: true, duplicate: false, sequence: 2 }
      }),
      getTask: vi.fn(async () => task(state, 2)),
    }
    const runtime = new A2AV1Runtime(
      {} as SupabaseClient,
      store as unknown as A2AV1TaskStore,
      vi.fn(async () => {
        throw new Error('private provider detail')
      }) as any,
      async () => null,
    )

    await expect(runtime.executeTask(ownerId, taskId)).resolves.toMatchObject({
      status: { state: 'TASK_STATE_FAILED' },
    })
    expect(store.failExecution).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'nexxi_execution_failed',
      errorMessage: expect.not.stringContaining('private provider detail'),
    }))
  })

  it('does not overwrite a task canceled while Nexxi is still running', async () => {
    let state: A2AV1TaskSnapshot['status']['state'] = 'TASK_STATE_WORKING'
    const store = {
      reconcileTask: vi.fn(async () => ({ reconciled: false })),
      claimTask: vi.fn(async () => ({
        claimed: true,
        outcome: 'claimed',
        taskId,
        contextId,
        executionToken,
      })),
      getExecutionContext: vi.fn(async () => executionContext()),
      appendEvent: vi.fn(async () => {
        state = 'TASK_STATE_CANCELED'
        throw new Error('A2A v1 execution token is no longer active')
      }),
      failExecution: vi.fn(async () => ({ stored: false, duplicate: false })),
      getTask: vi.fn(async () => task(state, 2)),
    }
    const executeNexie = vi.fn(async (_input: any, emit: (event: any) => void) => {
      emit({ type: 'completed', result })
      return result
    })
    const runtime = new A2AV1Runtime(
      {} as SupabaseClient,
      store as unknown as A2AV1TaskStore,
      executeNexie as any,
      async () => null,
    )

    await expect(runtime.executeTask(ownerId, taskId)).resolves.toMatchObject({
      status: { state: 'TASK_STATE_CANCELED' },
    })
    expect(store.failExecution).toHaveBeenCalled()
  })
})
