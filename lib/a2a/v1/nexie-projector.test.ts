import { describe, expect, it } from 'vitest'
import type { NexieTurnPayload } from '../../../contracts/nexie/v1'
import {
  NexieA2AV1Projector,
  isA2AV1TerminalOrInterruptedState,
} from './nexie-projector'

const timestamp = '2026-09-01T00:00:00.000Z'

const baseResult: NexieTurnPayload = {
  threadId: 'thread-1',
  agentId: 'agent-1',
  message: 'Found one.',
  cards: [],
  suggestions: ['Compare the result'],
  toolsUsed: ['search_pages'],
  memory: { privatePreference: 'never export this' },
  model: { configured: true, provider: 'test', name: 'test-model' },
}

function projector() {
  return new NexieA2AV1Projector(
    {
      taskId: 'task-1',
      contextId: 'context-1',
      artifactId: 'artifact-1',
    },
    () => timestamp,
  )
}

describe('NexieA2AV1Projector', () => {
  it('wraps preview chunks as v1 artifactUpdate payloads with replace-then-append semantics', () => {
    const subject = projector()
    const first = subject.project({
      type: 'text-delta',
      delta: 'Found ',
      source: 'model',
    })
    const second = subject.project({
      type: 'text-delta',
      delta: 'one.',
      source: 'model',
    })

    expect(first).toEqual([
      {
        artifactUpdate: {
          taskId: 'task-1',
          contextId: 'context-1',
          artifact: {
            artifactId: 'artifact-1',
            name: 'Nexxi response',
            parts: [{ text: 'Found ', mediaType: 'text/plain' }],
          },
          append: false,
          lastChunk: false,
          metadata: {
            'nexez:preview': true,
            'nexez:source': 'model',
          },
        },
      },
    ])
    expect(second).toMatchObject([
      {
        artifactUpdate: {
          append: true,
          artifact: {
            parts: [{ text: 'one.', mediaType: 'text/plain' }],
          },
        },
      },
    ])
  })

  it('ignores empty deltas instead of emitting an empty artifact part', () => {
    expect(projector().project({
      type: 'text-delta',
      delta: '',
      source: 'replay',
    })).toEqual([])
  })

  it('replaces previews with one authoritative artifact and a v1 terminal status', () => {
    const subject = projector()
    subject.project({ type: 'text-delta', delta: 'Let me ', source: 'model' })

    const events = subject.project({ type: 'completed', result: baseResult })

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      artifactUpdate: {
        taskId: 'task-1',
        contextId: 'context-1',
        append: false,
        lastChunk: true,
        artifact: {
          artifactId: 'artifact-1',
          parts: [
            { text: 'Found one.', mediaType: 'text/plain' },
            {
              data: {
                contractVersion: 1,
                cards: [],
                suggestions: ['Compare the result'],
              },
              mediaType: 'application/json',
            },
          ],
          metadata: {
            'nexez:authoritative': true,
            'nexez:threadId': 'thread-1',
            'nexez:agentId': 'agent-1',
            'nexez:toolsUsed': ['search_pages'],
          },
        },
      },
    })
    expect(events[1]).toEqual({
      statusUpdate: {
        taskId: 'task-1',
        contextId: 'context-1',
        status: {
          state: 'TASK_STATE_COMPLETED',
          timestamp,
        },
        metadata: {
          'nexez:threadId': 'thread-1',
          'nexez:agentId': 'agent-1',
        },
      },
    })

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('"kind"')
    expect(serialized).not.toContain('"final"')
    expect(serialized).not.toContain('privatePreference')
    expect(serialized).not.toContain('test-model')
  })

  it('turns pending approval into input-required without exporting its payload', () => {
    const result: NexieTurnPayload = {
      ...baseResult,
      message: 'Approval is required in Nexxi.',
      cards: [
        {
          type: 'approval',
          id: 'approval-1',
          status: 'PENDING',
          toolName: 'trigger_booking',
          title: 'Approve booking',
          summary: 'Book the selected service.',
          payload: {
            offerKey: 'service-1',
            approvalToken: 'must-not-leave-nexxi',
          },
          commerce: {
            state: 'actionable',
            rail: 'one_time',
            reasonCode: 'supported',
            message: 'This booking can proceed after buyer approval.',
          },
        },
      ],
    }

    const events = projector().project({ type: 'completed', result })
    expect(events[1]).toMatchObject({
      statusUpdate: {
        status: { state: 'TASK_STATE_INPUT_REQUIRED' },
      },
    })

    const serialized = JSON.stringify(events)
    expect(serialized).toContain('"remoteExecution":false')
    expect(serialized).toContain('"completionChannel":"nexxi"')
    expect(serialized).not.toContain('approvalToken')
    expect(serialized).not.toContain('must-not-leave-nexxi')
    expect(serialized).not.toContain('"payload"')
  })

  it('marks unsuccessful actions as failed and omits private action metadata', () => {
    const result: NexieTurnPayload = {
      ...baseResult,
      message: 'Nothing was charged or booked.',
      cards: [
        {
          type: 'action_result',
          id: 'action-1',
          title: 'Action failed',
          status: 'error',
          description: 'The checkout is no longer available.',
          metadata: {
            providerSecret: 'do-not-export',
            paymentIntentId: 'pi_private',
          },
        },
      ],
    }

    const events = projector().project({ type: 'completed', result })
    expect(events[1]).toMatchObject({
      statusUpdate: {
        status: { state: 'TASK_STATE_FAILED' },
      },
    })
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('providerSecret')
    expect(serialized).not.toContain('pi_private')
  })

  it('uses the same public projection for blocking task snapshots', () => {
    const snapshot = projector().snapshot(baseResult)
    expect(snapshot).toMatchObject({
      id: 'task-1',
      contextId: 'context-1',
      status: {
        state: 'TASK_STATE_COMPLETED',
        timestamp,
      },
      artifacts: [
        {
          artifactId: 'artifact-1',
          metadata: {
            'nexez:authoritative': true,
          },
        },
      ],
      metadata: {
        'nexez:threadId': 'thread-1',
        'nexez:agentId': 'agent-1',
      },
    })
  })

  it('fails early on missing or oversized projection identifiers', () => {
    expect(() => new NexieA2AV1Projector({
      taskId: ' ',
      contextId: 'context-1',
    })).toThrow(/taskId is required/)

    expect(() => new NexieA2AV1Projector({
      taskId: 'task-1',
      contextId: 'x'.repeat(201),
    })).toThrow(/contextId is too long/)
  })

  it('recognizes both terminal and interrupted v1 states', () => {
    expect(isA2AV1TerminalOrInterruptedState('TASK_STATE_COMPLETED')).toBe(true)
    expect(isA2AV1TerminalOrInterruptedState('TASK_STATE_INPUT_REQUIRED')).toBe(true)
    expect(isA2AV1TerminalOrInterruptedState('TASK_STATE_AUTH_REQUIRED')).toBe(true)
    expect(isA2AV1TerminalOrInterruptedState('TASK_STATE_WORKING')).toBe(false)
    expect(isA2AV1TerminalOrInterruptedState('TASK_STATE_SUBMITTED')).toBe(false)
  })
})
