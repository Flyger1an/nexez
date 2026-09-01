import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runNexieExecution, type NexieExecutionEvent } from '../../agents/nexie-stream'
import {
  NexieA2AV1Projector,
  isA2AV1TerminalOrInterruptedState,
  type A2AV1StreamResponse,
} from './nexie-projector'
import {
  A2A_V1_ERROR,
  A2AV1ProtocolError,
  parseA2AV1SendMessageParams,
  type ParsedA2AV1SendMessageParams,
} from './protocol'
import { hashA2AV1Work } from './request-hash'
import {
  A2AV1TaskStore,
  latestA2AV1UserMessage,
  taskEventSequence,
  type A2AV1StoredEvent,
  type A2AV1TaskSnapshot,
} from './task-store'

export type A2AV1AcceptedTask = {
  outcome: 'created' | 'duplicate'
  taskId: string
  task: A2AV1TaskSnapshot
}

export type A2AV1NexieExecutor = typeof runNexieExecution
export type A2AV1EmailResolver = (
  db: SupabaseClient,
  ownerId: string,
) => Promise<string | null>

export class A2AV1Runtime {
  readonly store: A2AV1TaskStore

  constructor(
    private readonly db: SupabaseClient,
    store?: A2AV1TaskStore,
    private readonly executeNexie: A2AV1NexieExecutor = runNexieExecution,
    private readonly resolveEmail: A2AV1EmailResolver = confirmedAccountEmail,
    private readonly newId: () => string = randomUUID,
  ) {
    this.store = store ?? new A2AV1TaskStore(db)
  }

  async acceptMessage(input: {
    ownerId: string
    apiKeyId: string
    params: ParsedA2AV1SendMessageParams
  }): Promise<A2AV1AcceptedTask> {
    const accepted = await this.store.acceptMessage({
      ownerId: input.ownerId,
      apiKeyId: input.apiKeyId,
      params: input.params,
      requestHash: hashA2AV1Work(input.params),
    })

    switch (accepted.outcome) {
      case 'created':
      case 'duplicate':
        break
      case 'conflict':
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.invalidParams,
          'messageId was already used for different work.',
          undefined,
          409,
        )
      case 'api_key_invalid':
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.invalidRequest,
          'The API key is no longer valid.',
          undefined,
          401,
        )
      case 'task_not_found':
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.taskNotFound,
          'Task not found.',
          undefined,
          404,
        )
      case 'context_mismatch':
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.invalidParams,
          'message.contextId does not match the task.',
          undefined,
          409,
        )
      case 'task_terminal':
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.invalidParams,
          'A settled task cannot accept another message.',
          undefined,
          409,
        )
      case 'task_busy':
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.unsupported,
          'The task is already processing another message.',
          undefined,
          409,
        )
      case 'history_limit':
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.invalidParams,
          'The task history limit has been reached.',
          undefined,
          409,
        )
    }

    if (!accepted.taskId) throw new Error('A2A acceptance omitted its task id.')
    await this.store.reconcileTask(input.ownerId, accepted.taskId)
    const task = await this.requireTask(
      input.ownerId,
      accepted.taskId,
      input.params.configuration.historyLength,
    )
    return {
      outcome: accepted.outcome,
      taskId: accepted.taskId,
      task,
    }
  }

  async executeTask(ownerId: string, taskId: string): Promise<A2AV1TaskSnapshot> {
    await this.store.reconcileTask(ownerId, taskId)
    const claim = await this.store.claimTask(ownerId, taskId, 55)
    if (!claim.claimed) {
      if (claim.outcome === 'api_key_invalid') {
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.invalidRequest,
          'The API key is no longer valid.',
          undefined,
          401,
        )
      }
      if (claim.outcome === 'task_not_found') {
        throw new A2AV1ProtocolError(
          A2A_V1_ERROR.taskNotFound,
          'Task not found.',
          undefined,
          404,
        )
      }
      return this.requireTask(ownerId, taskId)
    }
    if (!claim.executionToken) {
      throw new Error('A2A task claim omitted its execution token.')
    }

    try {
      const context = await this.store.getExecutionContext(
        ownerId,
        taskId,
        claim.executionToken,
      )
      if (!context) {
        await this.store.reconcileTask(ownerId, taskId)
        return this.requireTask(ownerId, taskId)
      }

      const latestUserMessage = latestA2AV1UserMessage(context.history)
      if (!latestUserMessage) {
        throw new SafeA2AExecutionError(
          'missing_user_message',
          'The task did not contain a buyer message and could not be completed.',
        )
      }

      const parsed = parseA2AV1SendMessageParams({ message: latestUserMessage })
      const projector = new NexieA2AV1Projector({
        taskId,
        contextId: context.contextId,
        artifactId: `${taskId}:nexxi-response`,
      })
      const agentMessageId = this.newId()
      const email = await this.resolveEmail(this.db, ownerId)

      let pendingPreview = ''
      let pendingSource: 'model' | 'replay' = 'model'
      let persistenceQueue = Promise.resolve()

      const appendProjected = async (event: A2AV1StreamResponse) => {
        await this.store.appendEvent({
          ownerId,
          taskId,
          executionToken: claim.executionToken!,
          eventId: this.newId(),
          event: withAgentMessageId(event, agentMessageId),
        })
      }

      const flushPreview = async () => {
        if (!pendingPreview) return
        const delta = pendingPreview
        pendingPreview = ''
        for (const event of projector.project({
          type: 'text-delta',
          delta,
          source: pendingSource,
        })) {
          await appendProjected(event)
        }
      }

      const persist = async (event: NexieExecutionEvent) => {
        if (event.type === 'text-delta') {
          if (pendingPreview && pendingSource !== event.source) await flushPreview()
          pendingSource = event.source
          pendingPreview += event.delta
          if (pendingPreview.length >= 256) await flushPreview()
          return
        }

        await flushPreview()
        for (const projected of projector.project(event)) {
          await appendProjected(projected)
        }
      }

      const enqueue = (event: NexieExecutionEvent) => {
        persistenceQueue = persistenceQueue.then(() => persist(event))
        // The provider may continue streaming briefly after a persistence failure.
        // Attach a handler immediately, then surface the error when the queue is awaited.
        void persistenceQueue.catch(() => undefined)
      }

      await this.executeNexie(
        {
          db: this.db,
          userId: ownerId,
          userEmail: email,
          message: parsed.text,
          threadId: context.nexieThreadId,
          mode: 'text',
          approval: null,
        },
        enqueue,
      )
      await persistenceQueue
    } catch (error) {
      console.error('[A2A] Nexxi task execution failed', {
        taskId,
        error: error instanceof Error ? error.message : 'unknown error',
      })
      const safe = error instanceof SafeA2AExecutionError
        ? error
        : new SafeA2AExecutionError(
            'nexxi_execution_failed',
            'Nexxi could not complete this task. Nothing was booked, paid, or submitted.',
          )
      try {
        await this.store.failExecution({
          ownerId,
          taskId,
          executionToken: claim.executionToken,
          eventId: this.newId(),
          errorCode: safe.code,
          errorMessage: safe.publicMessage,
        })
      } catch (failureWriteError) {
        console.error('[A2A] Failed to persist safe task failure', {
          taskId,
          error: failureWriteError instanceof Error
            ? failureWriteError.message
            : 'unknown error',
        })
      }
    }

    return this.requireTask(ownerId, taskId)
  }

  async waitForSettled(
    ownerId: string,
    taskId: string,
    options: {
      historyLength?: number
      timeoutMs?: number
      pollMs?: number
    } = {},
  ): Promise<A2AV1TaskSnapshot> {
    const timeoutMs = Math.max(0, Math.min(options.timeoutMs ?? 52_000, 55_000))
    const pollMs = Math.max(100, Math.min(options.pollMs ?? 300, 1_000))
    const deadline = Date.now() + timeoutMs

    while (true) {
      await this.store.reconcileTask(ownerId, taskId)
      const task = await this.requireTask(ownerId, taskId, options.historyLength)
      if (isA2AV1TerminalOrInterruptedState(task.status.state)) return task
      if (Date.now() >= deadline) return task
      await sleep(pollMs)
    }
  }

  async task(
    ownerId: string,
    taskId: string,
    historyLength?: number,
  ): Promise<A2AV1TaskSnapshot> {
    await this.store.reconcileTask(ownerId, taskId)
    return this.requireTask(ownerId, taskId, historyLength)
  }

  async eventsAfter(
    ownerId: string,
    taskId: string,
    sequence: number,
  ): Promise<A2AV1StoredEvent[]> {
    return this.store.listEvents(ownerId, taskId, sequence)
  }

  async cancelTask(
    ownerId: string,
    taskId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<A2AV1TaskSnapshot> {
    const canceled = await this.store.cancelTask(ownerId, taskId, metadata)
    if (canceled.outcome === 'task_not_found') {
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.taskNotFound,
        'Task not found.',
        undefined,
        404,
      )
    }
    if (canceled.outcome === 'task_not_cancelable') {
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.taskNotCancelable,
        'Task is not cancelable.',
        undefined,
        409,
      )
    }
    return this.requireTask(ownerId, taskId)
  }

  private async requireTask(
    ownerId: string,
    taskId: string,
    historyLength?: number,
  ): Promise<A2AV1TaskSnapshot> {
    const task = await this.store.getTask(ownerId, taskId, historyLength)
    if (!task) {
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.taskNotFound,
        'Task not found.',
        undefined,
        404,
      )
    }
    return task
  }
}

export function isA2AV1TaskSettled(task: A2AV1TaskSnapshot): boolean {
  return isA2AV1TerminalOrInterruptedState(task.status.state)
}

export { taskEventSequence }

function withAgentMessageId(
  event: A2AV1StreamResponse,
  messageId: string,
): A2AV1StreamResponse {
  if (!('artifactUpdate' in event) || event.artifactUpdate.lastChunk !== true) {
    return event
  }
  return {
    artifactUpdate: {
      ...event.artifactUpdate,
      metadata: {
        ...(event.artifactUpdate.metadata ?? {}),
        'nexez:messageId': messageId,
      },
    },
  }
}

class SafeA2AExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage)
    this.name = 'SafeA2AExecutionError'
  }
}

async function confirmedAccountEmail(
  db: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  try {
    const { data, error } = await db.auth.admin.getUserById(ownerId)
    if (error) {
      console.warn('[A2A] Could not load confirmed buyer email', {
        ownerId,
        error: error.message,
      })
      return null
    }
    return data.user?.email_confirmed_at ? (data.user.email ?? null) : null
  } catch (error) {
    console.warn('[A2A] Confirmed buyer email lookup failed', {
      ownerId,
      error: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
