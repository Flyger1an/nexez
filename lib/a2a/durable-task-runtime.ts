import 'server-only'

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runNexieExecution, type NexieExecutionEvent } from '../agents/nexie-stream'
import { NexieA2AStreamProjector, type NexieA2AStreamEvent } from './nexie-stream'
import {
  A2A_ERROR,
  A2AProtocolError,
  isFinalTaskState,
  messageText,
  requestHash,
  type A2ATask,
  type MessageSendParams,
} from './protocol'
import {
  DurableA2ATaskStore,
  latestUserText,
  type A2ATaskEventRow,
  type A2ATaskRow,
} from './durable-task-store'

export type AcceptedA2AMessage = {
  task: A2ATask
  taskId: string
  outcome: 'created' | 'duplicate'
}

export type NexieExecutionRunner = typeof runNexieExecution

export class DurableA2ARuntime {
  readonly store: DurableA2ATaskStore

  constructor(
    private readonly db: SupabaseClient,
    store?: DurableA2ATaskStore,
    private readonly executeNexie: NexieExecutionRunner = runNexieExecution,
  ) {
    this.store = store ?? new DurableA2ATaskStore(db)
  }

  async acceptMessage(input: {
    ownerId: string
    apiKeyId: string
    params: MessageSendParams
  }): Promise<AcceptedA2AMessage> {
    // Validate the canonical Nexxi text limit before allocating durable rows.
    // The worker reconstructs that same validated message from durable history.
    messageText(input.params.message)
    const accepted = await this.store.acceptMessage({
      ownerId: input.ownerId,
      apiKeyId: input.apiKeyId,
      messageId: input.params.message.messageId,
      requestHash: requestHash(input.params),
      message: input.params.message,
      taskId: input.params.message.taskId,
      contextId: input.params.message.contextId,
      metadata: input.params.metadata,
    })

    switch (accepted.outcome) {
      case 'conflict':
        throw new A2AProtocolError(
          A2A_ERROR.idempotencyConflict,
          'messageId was already used for a different request.',
          { messageId: input.params.message.messageId },
          409,
        )
      case 'task_not_found':
        throw new A2AProtocolError(A2A_ERROR.taskNotFound, 'Task not found', undefined, 404)
      case 'task_terminal':
        throw new A2AProtocolError(
          A2A_ERROR.invalidParams,
          'A terminal task cannot be restarted. Create a new task instead.',
          undefined,
          409,
        )
      case 'task_busy':
        throw new A2AProtocolError(
          A2A_ERROR.taskBusy,
          'The task is already processing another message.',
          undefined,
          409,
        )
      case 'context_mismatch':
        throw new A2AProtocolError(
          A2A_ERROR.invalidParams,
          'message.contextId does not match the existing task.',
          undefined,
          409,
        )
      case 'created':
      case 'duplicate':
        break
      default:
        throw new Error('A2A message acceptance returned an unknown outcome.')
    }

    if (!accepted.taskId) throw new Error('A2A message acceptance omitted the task id.')
    await this.store.reconcileTask(input.ownerId, accepted.taskId)
    const task = await this.store.getTask(
      input.ownerId,
      accepted.taskId,
      input.params.configuration.historyLength,
    )
    if (!task) throw new Error('Accepted A2A task could not be loaded.')
    return { task, taskId: accepted.taskId, outcome: accepted.outcome }
  }

  async executeTask(ownerId: string, taskId: string): Promise<A2ATask> {
    await this.store.reconcileTask(ownerId, taskId)
    const claim = await this.store.claimTask(ownerId, taskId)
    if (!claim.claimed || !claim.executionToken) {
      const existing = await this.store.getTask(ownerId, taskId, 0)
      if (!existing) throw new A2AProtocolError(A2A_ERROR.taskNotFound, 'Task not found', undefined, 404)
      return existing
    }

    const row = await this.requireTaskRow(ownerId, taskId)
    const prompt = latestUserText(row)
    if (!prompt) {
      await this.store.failExecution({
        ownerId,
        taskId,
        executionToken: claim.executionToken,
        eventId: randomUUID(),
        errorCode: 'empty_message',
        errorMessage: 'The stored task message was empty and could not be processed.',
      })
      return this.requireTask(ownerId, taskId, 0)
    }

    const projector = new NexieA2AStreamProjector({
      taskId,
      contextId: row.context_id,
      artifactId: `${taskId}:nexxi-response`,
    })
    const agentMessageId = randomUUID()
    let pendingPreview = ''
    let pendingPreviewSource: 'model' | 'replay' = 'model'

    const persistProjected = async (executionEvent: NexieExecutionEvent) => {
      const projected = projector.project(executionEvent)
      for (const event of projected) {
        await this.store.appendEvent({
          ownerId,
          taskId,
          executionToken: claim.executionToken!,
          eventId: randomUUID(),
          event: decorateEvent(event, agentMessageId),
        })
      }
    }

    const flushPreview = async () => {
      if (!pendingPreview) return
      const delta = pendingPreview
      pendingPreview = ''
      await persistProjected({
        type: 'text-delta',
        delta,
        source: pendingPreviewSource,
      })
    }

    try {
      await this.executeNexie(
        {
          db: this.db,
          userId: ownerId,
          userEmail: null,
          message: prompt,
          threadId: row.nexie_thread_id,
          mode: 'text',
          approval: null,
        },
        async (executionEvent: NexieExecutionEvent) => {
          if (executionEvent.type === 'text-delta') {
            if (pendingPreview && pendingPreviewSource !== executionEvent.source) {
              await flushPreview()
            }
            pendingPreviewSource = executionEvent.source
            pendingPreview += executionEvent.delta
            // Persist useful progressive chunks without turning every model token
            // into its own database transaction and ledger row.
            if (pendingPreview.length >= 256) await flushPreview()
            return
          }

          await flushPreview()
          await persistProjected(executionEvent)
        },
      )
    } catch (error) {
      console.error('[A2A] durable Nexxi execution failed', {
        taskId,
        error: error instanceof Error ? error.message : 'unknown error',
      })
      await this.store.failExecution({
        ownerId,
        taskId,
        executionToken: claim.executionToken,
        eventId: randomUUID(),
        errorCode: 'nexxi_execution_failed',
        errorMessage: 'Nexxi could not complete this task. Nothing was booked, paid, or submitted.',
      })
    }

    return this.requireTask(ownerId, taskId, 0)
  }

  async waitForSettled(
    ownerId: string,
    taskId: string,
    options: { timeoutMs?: number; historyLength?: number; pollMs?: number } = {},
  ): Promise<A2ATask> {
    const timeoutMs = Math.max(0, Math.min(options.timeoutMs ?? 50_000, 55_000))
    const pollMs = Math.max(50, Math.min(options.pollMs ?? 200, 1000))
    const deadline = Date.now() + timeoutMs

    while (true) {
      await this.store.reconcileTask(ownerId, taskId)
      const task = await this.requireTask(ownerId, taskId, options.historyLength)
      if (isFinalTaskState(task.status.state)) return task
      if (Date.now() >= deadline) return task
      await sleep(pollMs)
    }
  }

  async task(ownerId: string, taskId: string, historyLength?: number): Promise<A2ATask> {
    await this.store.reconcileTask(ownerId, taskId)
    return this.requireTask(ownerId, taskId, historyLength)
  }

  async eventsAfter(
    ownerId: string,
    taskId: string,
    sequence: number,
  ): Promise<A2ATaskEventRow[]> {
    return this.store.listEventsAfter(ownerId, taskId, sequence)
  }

  private async requireTask(ownerId: string, taskId: string, historyLength?: number): Promise<A2ATask> {
    const task = await this.store.getTask(ownerId, taskId, historyLength)
    if (!task) throw new A2AProtocolError(A2A_ERROR.taskNotFound, 'Task not found', undefined, 404)
    return task
  }

  private async requireTaskRow(ownerId: string, taskId: string): Promise<A2ATaskRow> {
    const row = await this.store.getTaskRow(ownerId, taskId)
    if (!row) throw new A2AProtocolError(A2A_ERROR.taskNotFound, 'Task not found', undefined, 404)
    return row
  }
}

function decorateEvent(event: NexieA2AStreamEvent, agentMessageId: string): NexieA2AStreamEvent {
  if (event.kind === 'status-update') {
    return {
      ...event,
      status: {
        ...event.status,
        timestamp: event.status.timestamp ?? new Date().toISOString(),
      },
    }
  }

  if (!event.lastChunk) return event
  return {
    ...event,
    metadata: {
      ...(event.metadata ?? {}),
      'nexez:messageId': agentMessageId,
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
