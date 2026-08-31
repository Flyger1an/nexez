import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NexieA2AStreamEvent } from './nexie-stream'
import type { A2AMessage, A2ATask } from './protocol'

const TASK_SELECT = [
  'id',
  'owner_id',
  'api_key_id',
  'context_id',
  'nexie_thread_id',
  'state',
  'status_message',
  'artifacts',
  'history',
  'metadata',
  'safe_error_code',
  'safe_error_message',
  'execution_token',
  'execution_attempts',
  'claimed_at',
  'lease_expires_at',
  'completed_at',
  'created_at',
  'updated_at',
  'last_event_sequence',
].join(',')

export type A2ATaskRow = {
  id: string
  owner_id: string
  api_key_id: string | null
  context_id: string
  nexie_thread_id: string | null
  state: A2ATask['status']['state']
  status_message: A2AMessage | null
  artifacts: A2ATask['artifacts'] | null
  history: A2AMessage[] | null
  metadata: Record<string, unknown> | null
  safe_error_code: string | null
  safe_error_message: string | null
  execution_token: string | null
  execution_attempts: number
  claimed_at: string | null
  lease_expires_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  last_event_sequence: number
}

export type A2ATaskEventRow = {
  task_id: string
  sequence: number
  event_id: string
  event_kind: 'artifact-update' | 'status-update'
  payload: NexieA2AStreamEvent
  created_at: string
}

export type AcceptMessageInput = {
  ownerId: string
  apiKeyId: string
  messageId: string
  requestHash: string
  message: A2AMessage
  taskId?: string
  contextId?: string
  metadata?: Record<string, unknown>
}

export type AcceptMessageResult = {
  outcome:
    | 'created'
    | 'duplicate'
    | 'conflict'
    | 'task_not_found'
    | 'task_terminal'
    | 'task_busy'
    | 'context_mismatch'
  taskId?: string
  contextId?: string
}

export type ClaimTaskResult = {
  claimed: boolean
  taskId: string
  contextId: string
  executionToken?: string
  sequence?: number
}

export type AppendEventResult = {
  sequence: number
  duplicate: boolean
}

export class DurableA2ATaskStore {
  constructor(private readonly db: SupabaseClient) {}

  async acceptMessage(input: AcceptMessageInput): Promise<AcceptMessageResult> {
    const { data, error } = await this.db.rpc('nz_a2a_accept_message', {
      p_owner_id: input.ownerId,
      p_api_key_id: input.apiKeyId,
      p_message_id: input.messageId,
      p_request_hash: input.requestHash,
      p_message: input.message,
      p_task_id: input.taskId ?? null,
      p_context_id: input.contextId ?? null,
      p_metadata: input.metadata ?? {},
    })
    if (error) throw new Error(`A2A message could not be accepted: ${error.message}`)
    return asObject(data) as AcceptMessageResult
  }

  async claimTask(ownerId: string, taskId: string, leaseSeconds = 90): Promise<ClaimTaskResult> {
    const { data, error } = await this.db.rpc('nz_a2a_claim_task', {
      p_owner_id: ownerId,
      p_task_id: taskId,
      p_lease_seconds: leaseSeconds,
    })
    if (error) throw new Error(`A2A task could not be claimed: ${error.message}`)
    return asObject(data) as ClaimTaskResult
  }

  async appendEvent(input: {
    ownerId: string
    taskId: string
    executionToken: string
    eventId: string
    event: NexieA2AStreamEvent
  }): Promise<AppendEventResult> {
    const { data, error } = await this.db.rpc('nz_a2a_append_event', {
      p_owner_id: input.ownerId,
      p_task_id: input.taskId,
      p_execution_token: input.executionToken,
      p_event_id: input.eventId,
      p_event: input.event,
    })
    if (error) throw new Error(`A2A task event could not be stored: ${error.message}`)
    return asObject(data) as AppendEventResult
  }

  async failExecution(input: {
    ownerId: string
    taskId: string
    executionToken: string
    eventId: string
    errorCode: string
    errorMessage: string
  }): Promise<void> {
    const { error } = await this.db.rpc('nz_a2a_fail_execution', {
      p_owner_id: input.ownerId,
      p_task_id: input.taskId,
      p_execution_token: input.executionToken,
      p_event_id: input.eventId,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
    })
    if (error) throw new Error(`A2A task failure could not be stored: ${error.message}`)
  }

  async reconcileTask(ownerId: string, taskId: string): Promise<void> {
    const { error } = await this.db.rpc('nz_a2a_reconcile_task', {
      p_owner_id: ownerId,
      p_task_id: taskId,
    })
    if (error) throw new Error(`A2A task could not be reconciled: ${error.message}`)
  }

  async getTaskRow(ownerId: string, taskId: string): Promise<A2ATaskRow | null> {
    const { data, error } = await this.db
      .from('a2a_tasks')
      .select(TASK_SELECT)
      .eq('owner_id', ownerId)
      .eq('id', taskId)
      .maybeSingle<A2ATaskRow>()
    if (error) throw new Error(`A2A task could not be loaded: ${error.message}`)
    return data ?? null
  }

  async getTask(ownerId: string, taskId: string, historyLength?: number): Promise<A2ATask | null> {
    const row = await this.getTaskRow(ownerId, taskId)
    return row ? taskFromRow(row, historyLength) : null
  }

  async listEventsAfter(
    ownerId: string,
    taskId: string,
    sequence: number,
    limit = 200,
  ): Promise<A2ATaskEventRow[]> {
    const task = await this.getTaskRow(ownerId, taskId)
    if (!task) return []
    const { data, error } = await this.db
      .from('a2a_task_events')
      .select('task_id, sequence, event_id, event_kind, payload, created_at')
      .eq('task_id', taskId)
      .gt('sequence', sequence)
      .order('sequence', { ascending: true })
      .limit(Math.max(1, Math.min(limit, 500)))
      .returns<A2ATaskEventRow[]>()
    if (error) throw new Error(`A2A task events could not be loaded: ${error.message}`)
    return data ?? []
  }
}

export function taskFromRow(row: A2ATaskRow, historyLength?: number): A2ATask {
  const history = row.history ?? []
  const selectedHistory = historyLength === undefined
    ? undefined
    : historyLength === 0
      ? []
      : history.slice(-historyLength)
  const statusMessage = row.status_message ?? safeStatusMessage(row)
  const metadata = {
    ...(row.metadata ?? {}),
    'nexez:eventSequence': row.last_event_sequence,
    'nexez:executionAttempts': row.execution_attempts,
    ...(row.safe_error_code ? { 'nexez:errorCode': row.safe_error_code } : {}),
  }

  return {
    kind: 'task',
    id: row.id,
    contextId: row.context_id,
    status: {
      state: row.state,
      timestamp: row.updated_at,
      ...(statusMessage ? { message: statusMessage } : {}),
    },
    ...((row.artifacts ?? []).length ? { artifacts: row.artifacts ?? [] } : {}),
    ...(selectedHistory ? { history: selectedHistory } : {}),
    metadata,
  }
}

export function latestUserText(row: A2ATaskRow): string {
  const message = [...(row.history ?? [])].reverse().find((item) => item.role === 'user')
  if (!message) return ''
  return message.parts
    .filter((part): part is Extract<A2APartFromMessage, { kind: 'text' }> => part.kind === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

type A2APartFromMessage = A2AMessage['parts'][number]

function safeStatusMessage(row: A2ATaskRow): A2AMessage | null {
  if (!row.safe_error_message) return null
  return {
    kind: 'message',
    role: 'agent',
    messageId: `${row.id}:status`,
    taskId: row.id,
    contextId: row.context_id,
    parts: [{ kind: 'text', text: row.safe_error_message }],
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error('A2A database function returned an invalid payload.')
}
