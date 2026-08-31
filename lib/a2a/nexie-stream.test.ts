import { describe, expect, it } from 'vitest'
import type { NexieTurnResult } from '../agents/nexie'
import { NexieA2AStreamProjector } from './nexie-stream'

const baseResult: NexieTurnResult = {
  threadId: 'thread-1',
  agentId: 'agent-1',
  message: 'Found one.',
  cards: [],
  suggestions: ['Compare the result'],
  toolsUsed: ['search_pages'],
  memory: {},
  model: { configured: true, provider: 'test', name: 'test-model' },
}

describe('NexieA2AStreamProjector', () => {
  it('uses replace-then-append semantics for progressive preview text', () => {
    const projector = new NexieA2AStreamProjector({
      taskId: 'task-1',
      contextId: 'context-1',
      artifactId: 'artifact-1',
    })

    const first = projector.project({
      type: 'text-delta',
      delta: 'Found ',
      source: 'model',
    })
    const second = projector.project({
      type: 'text-delta',
      delta: 'one.',
      source: 'model',
    })

    expect(first[0]).toMatchObject({
      kind: 'artifact-update',
      taskId: 'task-1',
      contextId: 'context-1',
      append: false,
      lastChunk: false,
      artifact: {
        artifactId: 'artifact-1',
        parts: [{ kind: 'text', text: 'Found ' }],
      },
    })
    expect(second[0]).toMatchObject({
      kind: 'artifact-update',
      append: true,
      artifact: { parts: [{ kind: 'text', text: 'one.' }] },
    })
  })

  it('replaces preview text with the authoritative completed Nexxi artifact', () => {
    const projector = new NexieA2AStreamProjector({
      taskId: 'task-1',
      contextId: 'context-1',
    })
    projector.project({ type: 'text-delta', delta: 'Let me ', source: 'model' })

    const events = projector.project({ type: 'completed', result: baseResult })

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      kind: 'artifact-update',
      append: false,
      lastChunk: true,
      artifact: {
        parts: [
          { kind: 'text', text: 'Found one.' },
          {
            kind: 'data',
            data: {
              contractVersion: 1,
              cards: [],
              suggestions: ['Compare the result'],
            },
          },
        ],
        metadata: {
          'nexez:authoritative': true,
          'nexez:threadId': 'thread-1',
          'nexez:toolsUsed': ['search_pages'],
        },
      },
    })
    expect(events[1]).toMatchObject({
      kind: 'status-update',
      status: { state: 'completed' },
      final: true,
    })
  })

  it('ends an approval turn in input-required rather than claiming completion', () => {
    const projector = new NexieA2AStreamProjector({
      taskId: 'task-approval',
      contextId: 'context-1',
    })
    const approvalResult: NexieTurnResult = {
      ...baseResult,
      cards: [
        {
          type: 'approval',
          id: 'approval-1',
          status: 'PENDING',
          toolName: 'trigger_booking',
          title: 'Approve booking',
          summary: 'Book the selected service.',
          payload: { offerKey: 'service-1' },
          commerce: {
            state: 'actionable',
            rail: 'one_time',
            reasonCode: 'supported',
            message: 'This booking can proceed after buyer approval.',
          },
        },
      ],
    }

    const events = projector.project({
      type: 'completed',
      result: approvalResult,
    })

    expect(events[1]).toMatchObject({
      kind: 'status-update',
      status: { state: 'input-required' },
      final: true,
    })
  })

  it('marks an unsuccessful Nexxi action as a failed A2A task', () => {
    const projector = new NexieA2AStreamProjector({
      taskId: 'task-failed',
      contextId: 'context-1',
    })
    const failedResult: NexieTurnResult = {
      ...baseResult,
      message: 'I could not complete that action. Nothing was charged or booked.',
      cards: [
        {
          type: 'action_result',
          id: 'action-1',
          title: 'Action failed',
          status: 'error',
          description: 'The checkout is no longer available.',
        },
      ],
    }

    const events = projector.project({
      type: 'completed',
      result: failedResult,
    })

    expect(events[1]).toMatchObject({
      kind: 'status-update',
      status: { state: 'failed' },
      final: true,
    })
  })
})
