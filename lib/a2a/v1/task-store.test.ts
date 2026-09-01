import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A2AV1TaskStore, latestA2AV1UserMessage } from './task-store'
import { parseA2AV1SendMessageParams } from './protocol'

const ownerId = '10000000-0000-4000-8000-000000000001'
const keyId = '20000000-0000-4000-8000-000000000001'
const taskId = '30000000-0000-4000-8000-000000000001'

function dbWithRpc(impl: (...args: any[]) => any) {
  return { rpc: vi.fn(impl) } as unknown as SupabaseClient
}

describe('A2AV1TaskStore', () => {
  it('passes owner-bound accepted work to the durable RPC', async () => {
    const db = dbWithRpc(async () => ({
      data: {
        outcome: 'created',
        taskId,
        contextId: 'buyer-context',
        state: 'TASK_STATE_SUBMITTED',
      },
      error: null,
    }))
    const telemetry = vi.fn()
    const store = new A2AV1TaskStore(db, telemetry)
    const params = parseA2AV1SendMessageParams({
      message: {
        messageId: 'message-1',
        role: 'ROLE_USER',
        parts: [{ text: 'Find a cleaner.' }],
      },
      metadata: { source: 'test' },
    })

    await expect(store.acceptMessage({
      ownerId,
      apiKeyId: keyId,
      params,
      requestHash: 'a'.repeat(64),
    })).resolves.toMatchObject({ outcome: 'created', taskId })

    expect(db.rpc).toHaveBeenCalledWith('nz_a2a_v1_accept_message', {
      p_owner_id: ownerId,
      p_api_key_id: keyId,
      p_message_id: 'message-1',
      p_request_hash: 'a'.repeat(64),
      p_message: params.message,
      p_task_id: null,
      p_context_id: null,
      p_metadata: { source: 'test' },
    })
    expect(telemetry).toHaveBeenCalledWith('a2a.v1.message.accepted', {
      resultClass: 'created',
    })
  })

  it('rejects unknown database claim outcomes', async () => {
    const db = dbWithRpc(async () => ({
      data: { claimed: false, outcome: 'mystery_outcome' },
      error: null,
    }))
    const store = new A2AV1TaskStore(db)

    await expect(store.claimTask(ownerId, taskId)).rejects.toThrow(
      'A2A claim returned an unknown outcome.',
    )
  })

  it('treats unknown opaque task ids as not found without querying UUID RPCs', async () => {
    const db = dbWithRpc(async () => ({ data: null, error: null }))
    const store = new A2AV1TaskStore(db)

    await expect(store.getTask(ownerId, 'external-task-name')).resolves.toBeNull()
    await expect(store.cancelTask(ownerId, 'external-task-name')).resolves.toEqual({
      outcome: 'task_not_found',
    })
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('preserves safe status messages and history from task snapshots', async () => {
    const statusMessage = {
      messageId: 'failure-message',
      role: 'ROLE_AGENT',
      parts: [{ text: 'The task could not be completed.' }],
    }
    const db = dbWithRpc(async () => ({
      data: {
        id: taskId,
        contextId: 'buyer-context',
        status: {
          state: 'TASK_STATE_FAILED',
          timestamp: '2026-09-01T04:00:00.000Z',
          message: statusMessage,
        },
        history: [statusMessage],
        metadata: { 'nexez:eventSequence': 3 },
      },
      error: null,
    }))
    const store = new A2AV1TaskStore(db)

    await expect(store.getTask(ownerId, taskId, 1)).resolves.toMatchObject({
      id: taskId,
      status: {
        state: 'TASK_STATE_FAILED',
        message: statusMessage,
      },
      history: [statusMessage],
      metadata: { 'nexez:eventSequence': 3 },
    })
  })

  it('extracts only the latest user message from mixed task history', () => {
    const user = {
      messageId: 'user-two',
      role: 'ROLE_USER',
      parts: [{ text: 'Use the second option.' }],
    }
    expect(latestA2AV1UserMessage([
      { messageId: 'user-one', role: 'ROLE_USER', parts: [{ text: 'Find options.' }] },
      { messageId: 'agent-one', role: 'ROLE_AGENT', parts: [{ text: 'Found two.' }] },
      user,
    ])).toEqual(user)
    expect(latestA2AV1UserMessage([{ role: 'ROLE_AGENT' }])).toBeNull()
  })

  it('parses ordered durable event rows', async () => {
    const payload = {
      statusUpdate: {
        taskId,
        contextId: 'buyer-context',
        status: { state: 'TASK_STATE_COMPLETED' },
      },
    }
    const db = dbWithRpc(async () => ({
      data: [{
        sequence: 4,
        eventId: '40000000-0000-4000-8000-000000000001',
        eventKind: 'status_update',
        payload,
        createdAt: '2026-09-01T04:00:00.000Z',
      }],
      error: null,
    }))
    const store = new A2AV1TaskStore(db)

    await expect(store.listEvents(ownerId, taskId, 3)).resolves.toEqual([{
      sequence: 4,
      eventId: '40000000-0000-4000-8000-000000000001',
      eventKind: 'status_update',
      payload,
      createdAt: '2026-09-01T04:00:00.000Z',
    }])
  })
})
