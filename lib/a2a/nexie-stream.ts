import { NEXIE_CONTRACT_VERSION } from '../../contracts/nexie/v1'
import type { NexieExecutionEvent } from '../agents/nexie-stream'
import type { NexieTurnResult } from '../agents/nexie'

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'auth-required'
  | 'unknown'

export type A2ATextPart = {
  kind: 'text'
  text: string
  metadata?: Record<string, unknown>
}

export type A2ADataPart = {
  kind: 'data'
  data: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type A2APart = A2ATextPart | A2ADataPart

export type A2AArtifact = {
  artifactId: string
  name?: string
  description?: string
  parts: A2APart[]
  metadata?: Record<string, unknown>
}

export type A2ATaskArtifactUpdateEvent = {
  kind: 'artifact-update'
  taskId: string
  contextId: string
  artifact: A2AArtifact
  append?: boolean
  lastChunk?: boolean
  metadata?: Record<string, unknown>
}

export type A2ATaskStatusUpdateEvent = {
  kind: 'status-update'
  taskId: string
  contextId: string
  status: {
    state: A2ATaskState
    timestamp?: string
  }
  final: boolean
  metadata?: Record<string, unknown>
}

export type NexieA2AStreamEvent =
  | A2ATaskArtifactUpdateEvent
  | A2ATaskStatusUpdateEvent

export type NexieA2AStreamIds = {
  taskId: string
  contextId: string
  artifactId?: string
}

function hasPendingApproval(result: NexieTurnResult): boolean {
  return result.cards.some(
    (card) => card.type === 'approval' && card.status === 'PENDING',
  )
}

/**
 * Projects Nexxi's canonical execution events into the A2A v0.3 task-stream
 * shapes. The projector is stateful only so preview chunks can use append
 * semantics; the completed artifact always replaces the preview and remains
 * authoritative.
 */
export class NexieA2AStreamProjector {
  private previewStarted = false
  private readonly artifactId: string

  constructor(private readonly ids: NexieA2AStreamIds) {
    this.artifactId = ids.artifactId ?? `${ids.taskId}:nexxi-response`
  }

  project(event: NexieExecutionEvent): NexieA2AStreamEvent[] {
    if (event.type === 'text-delta') {
      const append = this.previewStarted
      this.previewStarted = true
      return [
        {
          kind: 'artifact-update',
          taskId: this.ids.taskId,
          contextId: this.ids.contextId,
          artifact: {
            artifactId: this.artifactId,
            name: 'Nexxi response',
            parts: [{ kind: 'text', text: event.delta }],
          },
          append,
          lastChunk: false,
          metadata: {
            'nexez:preview': true,
            'nexez:source': event.source,
          },
        },
      ]
    }

    const { result } = event
    const state: A2ATaskState = hasPendingApproval(result)
      ? 'input-required'
      : 'completed'

    return [
      {
        kind: 'artifact-update',
        taskId: this.ids.taskId,
        contextId: this.ids.contextId,
        artifact: {
          artifactId: this.artifactId,
          name: 'Nexxi response',
          parts: [
            { kind: 'text', text: result.message },
            {
              kind: 'data',
              data: {
                contractVersion: NEXIE_CONTRACT_VERSION,
                cards: result.cards,
                suggestions: result.suggestions,
              },
            },
          ],
          metadata: {
            'nexez:authoritative': true,
            'nexez:threadId': result.threadId,
            'nexez:agentId': result.agentId,
            'nexez:toolsUsed': result.toolsUsed,
          },
        },
        // The final Nexxi result supersedes any pre-tool preview text.
        append: false,
        lastChunk: true,
      },
      {
        kind: 'status-update',
        taskId: this.ids.taskId,
        contextId: this.ids.contextId,
        status: { state },
        final: true,
        metadata: {
          'nexez:threadId': result.threadId,
          'nexez:agentId': result.agentId,
        },
      },
    ]
  }
}
