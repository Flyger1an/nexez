import 'server-only'

import {
  handleNexieTurn,
  type NexieTurnInput,
  type NexieTurnResult,
} from './nexie'

export type NexieExecutionEvent =
  | {
      type: 'text-delta'
      delta: string
      source: 'model' | 'replay'
    }
  | {
      type: 'completed'
      result: NexieTurnResult
    }

export type NexieExecutionInput = Omit<NexieTurnInput, 'onToken'>

// Adapter callbacks may return a convenience value such as Array.push's length.
// The runtime ignores that value but still awaits a returned promise in order.
export type NexieExecutionEmitter = (event: NexieExecutionEvent) => unknown

/** Split a completed message into word-ish chunks for deterministic and approval turns. */
export function chunkNexieText(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

/**
 * Run one canonical Nexxi turn and expose adapter-neutral execution events.
 *
 * The final `completed.result` is authoritative. `text-delta` events are only a
 * progressive preview and may contain a pre-tool preamble that is superseded by
 * the completed result. Async emitters are serialized so durable adapters can
 * persist each preview before the next event is observed.
 */
export async function runNexieExecution(
  input: NexieExecutionInput,
  emit: NexieExecutionEmitter,
): Promise<NexieTurnResult> {
  let emittedLiveText = false
  let emissionQueue: Promise<void> = Promise.resolve()
  const enqueue = (event: NexieExecutionEvent) => {
    emissionQueue = emissionQueue.then(async () => {
      await emit(event)
    })
    // The queue is awaited before return, but model generation may continue for a
    // while after a durable emitter rejects. Attach a handler immediately so Node
    // never reports that pending rejection as unhandled.
    void emissionQueue.catch(() => undefined)
  }

  const result = await handleNexieTurn({
    ...input,
    onToken: (delta) => {
      if (!delta) return
      emittedLiveText = true
      enqueue({ type: 'text-delta', delta, source: 'model' })
    },
  })

  // Deterministic and approval turns do not emit model deltas. Replay their
  // finished message so every adapter can preserve progressive rendering.
  if (!emittedLiveText && result.message) {
    for (const delta of chunkNexieText(result.message)) {
      enqueue({ type: 'text-delta', delta, source: 'replay' })
    }
  }

  enqueue({ type: 'completed', result })
  await emissionQueue
  return result
}
