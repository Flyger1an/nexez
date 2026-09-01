import 'server-only'

import {
  handleNexxiTurn,
  type NexxiTurnInput,
  type NexxiTurnResult,
} from './nexxi'

export type NexxiExecutionEvent =
  | {
      type: 'text-delta'
      delta: string
      source: 'model' | 'replay'
    }
  | {
      type: 'completed'
      result: NexxiTurnResult
    }

export type NexxiExecutionInput = Omit<NexxiTurnInput, 'onToken'>

export type NexxiExecutionEmitter = (event: NexxiExecutionEvent) => void

/** Split a completed message into word-ish chunks for deterministic and approval turns. */
export function chunkNexxiText(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

/**
 * Run one canonical Nexxi turn and expose adapter-neutral execution events.
 *
 * The final `completed.result` is authoritative. `text-delta` events are only a
 * progressive preview and may contain a pre-tool preamble that is superseded by
 * the completed result.
 */
export async function runNexxiExecution(
  input: NexxiExecutionInput,
  emit: NexxiExecutionEmitter,
): Promise<NexxiTurnResult> {
  let emittedLiveText = false

  const result = await handleNexxiTurn({
    ...input,
    onToken: (delta) => {
      if (!delta) return
      emittedLiveText = true
      emit({ type: 'text-delta', delta, source: 'model' })
    },
  })

  // Deterministic and approval turns do not emit model deltas. Replay their
  // finished message so every adapter can preserve progressive rendering.
  if (!emittedLiveText && result.message) {
    for (const delta of chunkNexxiText(result.message)) {
      emit({ type: 'text-delta', delta, source: 'replay' })
    }
  }

  emit({ type: 'completed', result })
  return result
}
