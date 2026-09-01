import { describe, expect, it } from 'vitest'
import { tailorA2AV1StreamResponse, tailorA2AV1Task } from './output-modes'

const task = {
  id: 'task-1',
  contextId: 'context-1',
  status: { state: 'TASK_STATE_COMPLETED' as const },
  artifacts: [{
    artifactId: 'artifact-1',
    parts: [
      { text: 'Found one.', mediaType: 'text/plain' as const },
      { data: { cards: [] }, mediaType: 'application/json' as const },
    ],
  }],
  history: [{
    messageId: 'agent-message',
    role: 'ROLE_AGENT',
    parts: [
      { text: 'Found one.', mediaType: 'text/plain' },
      { data: { cards: [] }, mediaType: 'application/json' },
    ],
  }],
}

describe('A2A v1 output mode tailoring', () => {
  it('returns only text parts to text-only SendMessage callers', () => {
    const tailored = tailorA2AV1Task(task, ['text/plain'])
    expect(tailored.artifacts?.[0]?.parts).toEqual([
      { text: 'Found one.', mediaType: 'text/plain' },
    ])
    expect((tailored.history?.[0] as any).parts).toEqual([
      { text: 'Found one.', mediaType: 'text/plain' },
    ])
  })

  it('suppresses text previews for JSON-only streaming callers', () => {
    expect(tailorA2AV1StreamResponse({
      artifactUpdate: {
        taskId: 'task-1',
        contextId: 'context-1',
        artifact: {
          artifactId: 'artifact-1',
          parts: [{ text: 'preview', mediaType: 'text/plain' }],
        },
        lastChunk: false,
      },
    }, ['application/json'])).toBeNull()
  })

  it('retains the structured part of the authoritative artifact', () => {
    expect(tailorA2AV1StreamResponse({
      artifactUpdate: {
        taskId: 'task-1',
        contextId: 'context-1',
        artifact: task.artifacts[0],
        lastChunk: true,
      },
    }, ['application/json'])).toMatchObject({
      artifactUpdate: {
        artifact: {
          parts: [{ data: { cards: [] }, mediaType: 'application/json' }],
        },
      },
    })
  })
})
