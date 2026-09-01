import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  A2AV1Task,
  A2AV1TaskState,
  A2AV1StreamResponse,
} from './nexie-projector'
import type {
  A2AV1UserMessage,
  ParsedA2AV1SendMessageParams,
} from './protocol'
import {
  emitA2AV1Telemetry,
  type A2AV1Telemetry,
} from './telemetry'

const TASK_STATES = new Set<A2AV1TaskState>([
  'TASK_STATE_UNSPECIFIED',
  'TASK_STATE_SUBMITTED',
  'TASK_STATE_WORKING',
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_INPUT_REQUIRED',
  'TASK_STATE_REJECTED',
  'TASK_STATE_AUTH_REQUIRED',
])

export type A2AV1TaskSnapshot = Omit<A2AV1Task, 'status'> & {
  status: A2AV1Task['status'] & { message?: unknown }
  history?: unknown[]
}

export type A2AV1AcceptOutcome =
  | 'created'
  | 'duplicate'
  | 'conflict'
  | 'api_key_invalid'
  | 'task_not_found'
  | 'context_mismatch'
  | 'task_terminal'
  | 'task_busy'
  | 'history_limit'

export type A2AV1AcceptResult = {
  outcome: A2AV1AcceptOutcome
  taskId?: string
  contextId?: string
  state?: A2AV1TaskState
}

export type A2AV1ClaimResult = {
  claimed: boolean
  outcome: string
  taskId?: string
  contextId?: string
  executionToken?: string
  leaseExpiresAt?: string
  sequence?: number
  state?: A2AV1TaskState
}

export type A2AV1ExecutionContext = {
  taskId: string
  contextId: string
  nexieThreadId: string | null
  history: unknown[]
  metadata: Record<string, unknown>
  leaseExpiresAt: string
}

export type A2AV1StoredEvent = {
  sequence: number
  eventId: string
  eventKind: 'artifact_update' | 'status_update'
  payload: A2AV1StreamResponse
  createdAt: string
}

export type A2AV1CancelResult = {
  outcome: 'canceled' | 'already_canceled' | 'task_not_found' | 'task_not_cancelable'
  taskId?: string
  contextId?: string
  state?: A2AV1TaskState
  sequence?: number
  eventId?: string
}

export class A2AV1TaskStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly telemetry: A2AV1Telemetry = emitA2AV1Telemetry,
  ) {}

  async acceptMessage(input: {
    ownerId: string
    apiKeyId: string
    params: ParsedA2AV1SendMessageParams
    requestHash: string
  }): Promise<A2AV1AcceptResult> {
    const taskId = input.params.message.taskId
    if (taskId && !isInternalTaskId(taskId)) {
      return { outcome: 'task_not_found' }
    }

    const { data, error } = await this.db.rpc('nz_a2a_v1_accept_message', {
      p_owner_id: input.ownerId,
      p_api_key_id: input.apiKeyId,
      p_message_id: input.params.message.messageId,
      p_request_hash: input.requestHash,
      p_message: input.params.message,
      p_task_id: taskId ?? null,
      p_context_id: input.params.message.contextId ?? null,
      p_metadata: input.params.metadata ?? {},
    })
    if (error) throw new Error(`A2A message acceptance failed: ${error.message}`)
    const result = parseAcceptResult(data)
    if (result.outcome === 'created') {
      this.telemetry('a2a.v1.message.accepted', { resultClass: 'created' })
    } else if (result.outcome === 'duplicate') {
      this.telemetry('a2a.v1.message.replayed', { resultClass: 'duplicate' })
    } else if (result.outcome === 'conflict') {
      this.telemetry('a2a.v1.message.conflict', { resultClass: 'message_id_conflict' })
    }
    return result
  }

  async claimTask(
    ownerId: string,
    taskId: string,
    leaseSeconds = 55,
  ): Promise<A2AV1ClaimResult> {
    if (!isInternalTaskId(taskId)) {
      return { claimed: false, outcome: 'task_not_found' }
    }
    const { data, error } = await this.db.rpc('nz_a2a_v1_claim_task', {
      p_owner_id: ownerId,
      p_task_id: taskId,
      p_lease_seconds: leaseSeconds,
    })
    if (error) throw new Error(`A2A task claim failed: ${error.message}`)
    return parseClaimResult(data)
  }

  async getTask(
    ownerId: string,
    taskId: string,
    historyLength?: number,
  ): Promise<A2AV1TaskSnapshot | null> {
    if (!isInternalTaskId(taskId)) return null
    const { data, error } = await this.db.rpc('nz_a2a_v1_get_task', {
      p_owner_id: ownerId,
      p_task_id: taskId,
      p_history_length: historyLength ?? null,
    })
    if (error) throw new Error(`A2A task read failed: ${error.message}`)
    return data === null ? null : parseTask(data)
  }

  async listEvents(
    ownerId: string,
    taskId: string,
    afterSequence: number,
    limit = 200,
  ): Promise<A2AV1StoredEvent[]> {
    if (!isInternalTaskId(taskId)) return []
    const { data, error } = await this.db.rpc('nz_a2a_v1_list_events', {
      p_owner_id: ownerId,
      p_task_id: taskId,
      p_after_sequence: afterSequence,
      p_limit: limit,
    })
    if (error) throw new Error(`A2A task event read failed: ${error.message}`)
    return parseEvents(data)
  }

  async getExecutionContext(
    ownerId: string,
    taskId: string,
    executionToken: string,
  ): Promise<A2AV1ExecutionContext | null> {
    if (!isInternalTaskId(taskId) || !isInternalTaskId(executionToken)) return null
    const { data, error } = await this.db.rpc('nz_a2a_v1_get_execution_context', {
      p_owner_id: ownerId,
      p_task_id: taskId,
      p_execution_token: executionToken,
    })
    if (error) throw new Error(`A2A execution context read failed: ${error.message}`)
    return data === null ? null : parseExecutionContext(data)
  }

  async appendEvent(input: {
    ownerId: string
    taskId: string
    executionToken: string
    eventId: string
    event: A2AV1StreamResponse
  }): Promise<{ sequence: number; duplicate: boolean; settled: boolean }> {
    const { data, error } = await this.db.rpc('nz_a2a_v1_append_event', {
      p_owner_id: input.ownerId,
      p_task_id: input.taskId,
      p_execution_token: input.executionToken,
      p_event_id: input.eventId,
      p_event: input.event,
    })
    if (error) {
      const terminalConflict = error.message.includes('execution token is no longer active')
      this.telemetry(
        terminalConflict
          ? 'a2a.v1.task.terminal_write_conflict'
          : 'a2a.v1.event.persistence_failed',
        { errorClass: terminalConflict ? 'execution_token_inactive' : 'event_write_failed' },
      )
      throw new Error(`A2A task event write failed: ${error.message}`)
    }
    const record = requiredRecord(data, 'A2A append result')
    const result = {
      sequence: requiredInteger(record.sequence, 'A2A event sequence'),
      duplicate: record.duplicate === true,
      settled: record.settled === true,
    }
    const eventKind = 'artifactUpdate' in input.event
      ? 'artifact_update'
      : 'status_update'
    const taskState = statusUpdateState(input.event)
    this.telemetry('a2a.v1.event.persisted', {
      eventKind,
      eventSequence: result.sequence,
      resultClass: result.duplicate ? 'duplicate' : 'stored',
      taskState,
    })
    if (taskState) {
      this.telemetry('a2a.v1.task.state_changed', {
        taskState,
        eventSequence: result.sequence,
        resultClass: result.settled ? 'settled' : 'active',
      })
    }
    return result
  }

  async cancelTask(
    ownerId: string,
    taskId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<A2AV1CancelResult> {
    if (!isInternalTaskId(taskId)) return { outcome: 'task_not_found' }
    const { data, error } = await this.db.rpc('nz_a2a_v1_cancel_task', {
      p_owner_id: ownerId,
      p_task_id: taskId,
      p_metadata: metadata,
    })
    if (error) throw new Error(`A2A task cancellation failed: ${error.message}`)
    const record = requiredRecord(data, 'A2A cancellation result')
    const outcome = requiredString(record.outcome, 'A2A cancellation outcome')
    if (!['canceled', 'already_canceled', 'task_not_found', 'task_not_cancelable'].includes(outcome)) {
      throw new Error('A2A cancellation returned an unknown outcome.')
    }
    const result = {
      outcome: outcome as A2AV1CancelResult['outcome'],
      ...optionalTaskFields(record),
      ...(typeof record.sequence === 'number' ? { sequence: requiredInteger(record.sequence, 'A2A cancellation sequence') } : {}),
      ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
    }
    if (result.outcome === 'canceled' || result.outcome === 'already_canceled') {
      this.telemetry('a2a.v1.task.canceled', {
        taskState: result.state,
        resultClass: result.outcome,
        eventSequence: result.sequence,
      })
    }
    return result
  }

  async failExecution(input: {
    ownerId: string
    taskId: string
    executionToken: string
    eventId: string
    errorCode: string
    errorMessage: string
  }): Promise<{ stored: boolean; duplicate: boolean; sequence?: number }> {
    const { data, error } = await this.db.rpc('nz_a2a_v1_fail_execution', {
      p_owner_id: input.ownerId,
      p_task_id: input.taskId,
      p_execution_token: input.executionToken,
      p_event_id: input.eventId,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
    })
    if (error) throw new Error(`A2A task failure write failed: ${error.message}`)
    const record = requiredRecord(data, 'A2A failure result')
    const result = {
      stored: record.stored === true,
      duplicate: record.duplicate === true,
      ...(typeof record.sequence === 'number' ? { sequence: requiredInteger(record.sequence, 'A2A failure sequence') } : {}),
    }
    if (result.stored) {
      this.telemetry('a2a.v1.task.state_changed', {
        taskState: 'TASK_STATE_FAILED',
        resultClass: result.duplicate ? 'duplicate' : 'settled',
        eventSequence: result.sequence,
      })
    }
    if (!result.stored) {
      this.telemetry('a2a.v1.task.terminal_write_conflict', {
        resultClass: 'failure_not_stored',
        errorClass: 'execution_token_inactive',
      })
    }
    return result
  }

  async reconcileTask(
    ownerId: string,
    taskId: string,
  ): Promise<{ reconciled: boolean; sequence?: number }> {
    if (!isInternalTaskId(taskId)) return { reconciled: false }
    const { data, error } = await this.db.rpc('nz_a2a_v1_reconcile_task', {
      p_owner_id: ownerId,
      p_task_id: taskId,
    })
    if (error) throw new Error(`A2A task reconciliation failed: ${error.message}`)
    const record = requiredRecord(data, 'A2A reconciliation result')
    const result = {
      reconciled: record.reconciled === true,
      ...(typeof record.sequence === 'number' ? { sequence: requiredInteger(record.sequence, 'A2A reconciliation sequence') } : {}),
    }
    if (result.reconciled) {
      this.telemetry('a2a.v1.task.reconciled', {
        taskState: 'TASK_STATE_FAILED',
        resultClass: 'expired_lease',
        errorClass: 'worker_lease_expired',
        eventSequence: result.sequence,
      })
    }
    return result
  }
}

export function latestA2AV1UserMessage(history: unknown[]): A2AV1UserMessage | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]
    if (isRecord(message) && message.role === 'ROLE_USER') {
      return message as unknown as A2AV1UserMessage
    }
  }
  return null
}

export function taskEventSequence(task: A2AV1TaskSnapshot): number {
  const value = task.metadata?.['nexez:eventSequence']
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0
}

export function isInternalTaskId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseAcceptResult(value: unknown): A2AV1AcceptResult {
  const record = requiredRecord(value, 'A2A acceptance result')
  const outcome = requiredString(record.outcome, 'A2A acceptance outcome')
  const allowed: A2AV1AcceptOutcome[] = [
    'created',
    'duplicate',
    'conflict',
    'api_key_invalid',
    'task_not_found',
    'context_mismatch',
    'task_terminal',
    'task_busy',
    'history_limit',
  ]
  if (!allowed.includes(outcome as A2AV1AcceptOutcome)) {
    throw new Error('A2A acceptance returned an unknown outcome.')
  }
  return {
    outcome: outcome as A2AV1AcceptOutcome,
    ...optionalTaskFields(record),
  }
}

function parseClaimResult(value: unknown): A2AV1ClaimResult {
  const record = requiredRecord(value, 'A2A claim result')
  const outcome = requiredString(record.outcome, 'A2A claim outcome')
  if (!['claimed', 'task_not_found', 'task_not_submitted', 'api_key_invalid'].includes(outcome)) {
    throw new Error('A2A claim returned an unknown outcome.')
  }
  return {
    claimed: record.claimed === true,
    outcome,
    ...optionalTaskFields(record),
    ...(typeof record.executionToken === 'string' ? { executionToken: record.executionToken } : {}),
    ...(typeof record.leaseExpiresAt === 'string' ? { leaseExpiresAt: record.leaseExpiresAt } : {}),
    ...(typeof record.sequence === 'number' ? { sequence: requiredInteger(record.sequence, 'A2A claim sequence') } : {}),
  }
}

function optionalTaskFields(record: Record<string, unknown>) {
  const state = typeof record.state === 'string' && TASK_STATES.has(record.state as A2AV1TaskState)
    ? record.state as A2AV1TaskState
    : undefined
  return {
    ...(typeof record.taskId === 'string' ? { taskId: record.taskId } : {}),
    ...(typeof record.contextId === 'string' ? { contextId: record.contextId } : {}),
    ...(state ? { state } : {}),
  }
}

function parseTask(value: unknown): A2AV1TaskSnapshot {
  const record = requiredRecord(value, 'A2A task')
  const status = requiredRecord(record.status, 'A2A task status')
  const state = requiredString(status.state, 'A2A task state')
  if (!TASK_STATES.has(state as A2AV1TaskState)) {
    throw new Error('A2A task returned an invalid state.')
  }
  return {
    id: requiredString(record.id, 'A2A task id'),
    ...(typeof record.contextId === 'string' ? { contextId: record.contextId } : {}),
    status: {
      state: state as A2AV1TaskState,
      ...(typeof status.timestamp === 'string' ? { timestamp: status.timestamp } : {}),
      ...(status.message !== undefined ? { message: status.message } : {}),
    },
    ...(Array.isArray(record.artifacts) ? { artifacts: record.artifacts as A2AV1Task['artifacts'] } : {}),
    ...(Array.isArray(record.history) ? { history: record.history } : {}),
    ...(isRecord(record.metadata) ? { metadata: record.metadata } : {}),
  }
}

function parseEvents(value: unknown): A2AV1StoredEvent[] {
  if (!Array.isArray(value)) throw new Error('A2A event list returned an invalid payload.')
  return value.map((item) => {
    const record = requiredRecord(item, 'A2A event')
    const eventKind = requiredString(record.eventKind, 'A2A event kind')
    if (eventKind !== 'artifact_update' && eventKind !== 'status_update') {
      throw new Error('A2A event returned an invalid kind.')
    }
    return {
      sequence: requiredInteger(record.sequence, 'A2A event sequence'),
      eventId: requiredString(record.eventId, 'A2A event id'),
      eventKind,
      payload: requiredRecord(record.payload, 'A2A event payload') as A2AV1StreamResponse,
      createdAt: requiredString(record.createdAt, 'A2A event creation time'),
    }
  })
}

function parseExecutionContext(value: unknown): A2AV1ExecutionContext {
  const record = requiredRecord(value, 'A2A execution context')
  return {
    taskId: requiredString(record.taskId, 'A2A execution task id'),
    contextId: requiredString(record.contextId, 'A2A execution context id'),
    nexieThreadId: typeof record.nexieThreadId === 'string' ? record.nexieThreadId : null,
    history: Array.isArray(record.history) ? record.history : [],
    metadata: isRecord(record.metadata) ? record.metadata : {},
    leaseExpiresAt: requiredString(record.leaseExpiresAt, 'A2A execution lease expiration'),
  }
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} was not an object.`)
  return value
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} was not a string.`)
  return value
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${label} was not an integer.`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function statusUpdateState(event: A2AV1StreamResponse): string | undefined {
  return 'statusUpdate' in event ? event.statusUpdate.status.state : undefined
}
