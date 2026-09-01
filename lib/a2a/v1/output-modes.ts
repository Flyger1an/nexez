import type { A2AV1StreamResponse } from './nexxi-projector'
import type { A2AV1TaskSnapshot } from './task-store'

type JsonRecord = Record<string, unknown>

export function tailorA2AV1Task(
  task: A2AV1TaskSnapshot,
  acceptedModes?: string[],
): A2AV1TaskSnapshot {
  const modes = modeSet(acceptedModes)
  if (!modes) return task

  const artifacts = task.artifacts
    ?.map((artifact) => tailorArtifact(artifact as unknown as JsonRecord, modes))
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
  const statusMessage = tailorMessage(task.status.message, modes)
  const history = task.history
    ?.map((message) => tailorHistoryMessage(message, modes))
    .filter((message): message is NonNullable<typeof message> => message !== undefined)

  return {
    ...task,
    status: statusMessage === undefined
      ? omitMessage(task.status)
      : { ...task.status, message: statusMessage },
    ...(artifacts ? { artifacts: artifacts as A2AV1TaskSnapshot['artifacts'] } : {}),
    ...(history ? { history } : {}),
  }
}

export function tailorA2AV1StreamResponse(
  response: A2AV1StreamResponse,
  acceptedModes?: string[],
): A2AV1StreamResponse | null {
  const modes = modeSet(acceptedModes)
  if (!modes) return response

  if ('task' in response) {
    return { task: tailorA2AV1Task(response.task as A2AV1TaskSnapshot, acceptedModes) }
  }
  if ('artifactUpdate' in response) {
    const artifact = tailorArtifact(
      response.artifactUpdate.artifact as unknown as JsonRecord,
      modes,
    )
    if (!artifact) return null
    return {
      artifactUpdate: {
        ...response.artifactUpdate,
        artifact: artifact as typeof response.artifactUpdate.artifact,
      },
    }
  }

  const status = response.statusUpdate.status as JsonRecord
  const message = tailorMessage(status.message, modes)
  return {
    statusUpdate: {
      ...response.statusUpdate,
      status: message === undefined
        ? omitMessage(status)
        : { ...status, message },
    },
  } as unknown as A2AV1StreamResponse
}

function tailorArtifact(
  artifact: JsonRecord,
  modes: Set<string>,
): JsonRecord | null {
  if (!Array.isArray(artifact.parts)) return artifact
  const parts = artifact.parts.filter((part) => acceptsPart(part, modes))
  return parts.length ? { ...artifact, parts } : null
}

function tailorHistoryMessage(
  value: unknown,
  modes: Set<string>,
): unknown | undefined {
  if (!isRecord(value) || value.role !== 'ROLE_AGENT') return value
  return tailorMessage(value, modes)
}

function tailorMessage(value: unknown, modes: Set<string>): unknown | undefined {
  if (!isRecord(value) || !Array.isArray(value.parts)) return value
  const parts = value.parts.filter((part) => acceptsPart(part, modes))
  return parts.length ? { ...value, parts } : undefined
}

function acceptsPart(value: unknown, modes: Set<string>): boolean {
  if (!isRecord(value)) return false
  const declared = typeof value.mediaType === 'string'
    ? value.mediaType.toLowerCase()
    : 'text' in value
      ? 'text/plain'
      : 'data' in value
        ? 'application/json'
        : ''
  return Boolean(declared && modes.has(declared))
}

function modeSet(modes?: string[]): Set<string> | null {
  return modes?.length
    ? new Set(modes.map((mode) => mode.toLowerCase()))
    : null
}

function omitMessage<T extends JsonRecord>(value: T): Omit<T, 'message'> {
  const { message: _message, ...rest } = value
  return rest
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
