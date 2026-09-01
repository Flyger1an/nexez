import 'server-only'

import { createHash } from 'node:crypto'
import type { ParsedA2AV1SendMessageParams } from './protocol'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Bind idempotency to the requested work, not delivery preferences. A caller may
 * retry the same message with a different history length or response timing
 * without creating a second task, while any change to the message or metadata
 * produces a different hash.
 */
export function hashA2AV1Work(params: ParsedA2AV1SendMessageParams): string {
  return createHash('sha256')
    .update(canonicalJson({
      message: params.message,
      metadata: params.metadata ?? {},
    }))
    .digest('hex')
}
