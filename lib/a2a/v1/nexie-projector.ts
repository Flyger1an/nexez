import {
  NEXIE_CONTRACT_VERSION,
  type NexieCard,
  type NexieTurnPayload,
} from '../../../contracts/nexie/v1'

export type A2AV1TaskState =
  | 'TASK_STATE_UNSPECIFIED'
  | 'TASK_STATE_SUBMITTED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_REJECTED'
  | 'TASK_STATE_AUTH_REQUIRED'

export type A2AV1TextPart = {
  text: string
  mediaType?: 'text/plain'
  metadata?: Record<string, unknown>
}

export type A2AV1DataPart = {
  data: unknown
  mediaType?: 'application/json'
  metadata?: Record<string, unknown>
}

export type A2AV1Part = A2AV1TextPart | A2AV1DataPart

export type A2AV1Artifact = {
  artifactId: string
  name?: string
  description?: string
  parts: A2AV1Part[]
  metadata?: Record<string, unknown>
  extensions?: string[]
}

export type A2AV1TaskStatus = {
  state: A2AV1TaskState
  timestamp?: string
}

export type A2AV1Task = {
  id: string
  contextId?: string
  status: A2AV1TaskStatus
  artifacts?: A2AV1Artifact[]
  metadata?: Record<string, unknown>
}

export type A2AV1TaskArtifactUpdateEvent = {
  taskId: string
  contextId: string
  artifact: A2AV1Artifact
  append?: boolean
  lastChunk?: boolean
  metadata?: Record<string, unknown>
}

export type A2AV1TaskStatusUpdateEvent = {
  taskId: string
  contextId: string
  status: A2AV1TaskStatus
  metadata?: Record<string, unknown>
}

export type A2AV1StreamResponse =
  | { task: A2AV1Task }
  | { artifactUpdate: A2AV1TaskArtifactUpdateEvent }
  | { statusUpdate: A2AV1TaskStatusUpdateEvent }

export type NexieProjectableEvent =
  | {
      type: 'text-delta'
      delta: string
      source: 'model' | 'replay'
    }
  | {
      type: 'completed'
      result: NexieTurnPayload
    }

export type NexieA2AV1ProjectionIds = {
  taskId: string
  contextId: string
  artifactId?: string
}

type PublicNexieCard = Record<string, unknown>
type Clock = () => string

const DEFAULT_ARTIFACT_NAME = 'Nexxi response'

function validateProjectionId(value: string, name: string): string {
  const id = value.trim()
  if (!id) throw new Error(`${name} is required.`)
  if (id.length > 200) throw new Error(`${name} is too long.`)
  return id
}

function terminalState(result: NexieTurnPayload): A2AV1TaskState {
  if (
    result.cards.some(
      (card) => card.type === 'approval' && card.status === 'PENDING',
    )
  ) {
    return 'TASK_STATE_INPUT_REQUIRED'
  }

  if (
    result.cards.some(
      (card) =>
        (card.type === 'action_result' && card.status === 'error') ||
        (card.type === 'approval' && card.status === 'FAILED'),
    )
  ) {
    return 'TASK_STATE_FAILED'
  }

  return 'TASK_STATE_COMPLETED'
}

/**
 * Approval payloads remain inside Nexxi. External agents receive enough context
 * to explain the required human step, but never the prepared execution payload.
 * Action-result metadata is also omitted because it may contain provider or
 * transaction identifiers that are not part of the public Nexxi contract.
 */
function publicCard(card: NexieCard): PublicNexieCard {
  if (card.type === 'approval') {
    return {
      type: card.type,
      id: card.id,
      status: card.status,
      toolName: card.toolName,
      title: card.title,
      summary: card.summary,
      commerce: card.commerce,
      remoteExecution: false,
      completionChannel: 'nexxi',
    }
  }

  if (card.type === 'action_result') {
    return {
      type: card.type,
      id: card.id,
      title: card.title,
      status: card.status,
      description: card.description,
      ...(card.url ? { url: card.url } : {}),
    }
  }

  return { ...card }
}

function authoritativeArtifact(
  artifactId: string,
  result: NexieTurnPayload,
): A2AV1Artifact {
  const cards = result.cards.map(publicCard)
  const parts: A2AV1Part[] = []
  if (result.message) {
    parts.push({ text: result.message, mediaType: 'text/plain' })
  }
  parts.push({
    data: {
      contractVersion: NEXIE_CONTRACT_VERSION,
      cards,
      suggestions: result.suggestions,
    },
    mediaType: 'application/json',
  })

  return {
    artifactId,
    name: DEFAULT_ARTIFACT_NAME,
    parts,
    metadata: {
      'nexez:authoritative': true,
      'nexez:threadId': result.threadId,
      'nexez:agentId': result.agentId,
      'nexez:toolsUsed': result.toolsUsed,
    },
  }
}

/**
 * Projects Nexxi's adapter-neutral execution events into A2A v1 ProtoJSON
 * stream payloads. v1 has no legacy `kind` discriminator and no `final` field;
 * callers determine stream completion from the task state.
 */
export class NexieA2AV1Projector {
  private previewStarted = false
  private readonly taskId: string
  private readonly contextId: string
  private readonly artifactId: string

  constructor(
    ids: NexieA2AV1ProjectionIds,
    private readonly clock: Clock = () => new Date().toISOString(),
  ) {
    this.taskId = validateProjectionId(ids.taskId, 'taskId')
    this.contextId = validateProjectionId(ids.contextId, 'contextId')
    this.artifactId = validateProjectionId(
      ids.artifactId ?? `${this.taskId}:nexxi-response`,
      'artifactId',
    )
  }

  project(event: NexieProjectableEvent): A2AV1StreamResponse[] {
    if (event.type === 'text-delta') {
      if (!event.delta) return []
      const append = this.previewStarted
      this.previewStarted = true
      return [
        {
          artifactUpdate: {
            taskId: this.taskId,
            contextId: this.contextId,
            artifact: {
              artifactId: this.artifactId,
              name: DEFAULT_ARTIFACT_NAME,
              parts: [{ text: event.delta, mediaType: 'text/plain' }],
            },
            append,
            lastChunk: false,
            metadata: {
              'nexez:preview': true,
              'nexez:source': event.source,
            },
          },
        },
      ]
    }

    const timestamp = this.clock()
    const state = terminalState(event.result)
    const artifact = authoritativeArtifact(this.artifactId, event.result)

    return [
      {
        artifactUpdate: {
          taskId: this.taskId,
          contextId: this.contextId,
          artifact,
          append: false,
          lastChunk: true,
        },
      },
      {
        statusUpdate: {
          taskId: this.taskId,
          contextId: this.contextId,
          status: { state, timestamp },
          metadata: {
            'nexez:threadId': event.result.threadId,
            'nexez:agentId': event.result.agentId,
          },
        },
      },
    ]
  }

  /** Blocking SendMessage and GetTask can reuse the exact same safe projection. */
  snapshot(result: NexieTurnPayload): A2AV1Task {
    return {
      id: this.taskId,
      contextId: this.contextId,
      status: {
        state: terminalState(result),
        timestamp: this.clock(),
      },
      artifacts: [authoritativeArtifact(this.artifactId, result)],
      metadata: {
        'nexez:threadId': result.threadId,
        'nexez:agentId': result.agentId,
      },
    }
  }
}

export function isA2AV1TerminalOrInterruptedState(state: A2AV1TaskState): boolean {
  return [
    'TASK_STATE_COMPLETED',
    'TASK_STATE_FAILED',
    'TASK_STATE_CANCELED',
    'TASK_STATE_INPUT_REQUIRED',
    'TASK_STATE_REJECTED',
    'TASK_STATE_AUTH_REQUIRED',
  ].includes(state)
}
