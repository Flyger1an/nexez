import 'server-only'

import { captureError, captureEvent, captureSignal } from '../../observability'

export type A2AV1TelemetryEvent =
  | 'a2a.v1.auth.denied'
  | 'a2a.v1.event.persisted'
  | 'a2a.v1.event.persistence_failed'
  | 'a2a.v1.message.accepted'
  | 'a2a.v1.message.conflict'
  | 'a2a.v1.message.replayed'
  | 'a2a.v1.rate_limited'
  | 'a2a.v1.request.failed'
  | 'a2a.v1.scheduled_execution.failed'
  | 'a2a.v1.sse.connected'
  | 'a2a.v1.sse.disconnected'
  | 'a2a.v1.sse.invalid_cursor'
  | 'a2a.v1.sse.resumed'
  | 'a2a.v1.task.canceled'
  | 'a2a.v1.task.claim_lost'
  | 'a2a.v1.task.claim_delayed'
  | 'a2a.v1.task.claimed'
  | 'a2a.v1.task.reconciled'
  | 'a2a.v1.task.safe_failure'
  | 'a2a.v1.task.state_changed'
  | 'a2a.v1.task.terminal_write_conflict'

export type A2AV1TelemetryDimensions = {
  method?: string
  taskState?: string
  resultClass?: string
  errorClass?: string
  scope?: 'ip' | 'owner' | 'turn'
  eventKind?: 'artifact_update' | 'status_update'
  eventSequence?: number
  claimDelayMs?: number
  durationMs?: number
}

export type A2AV1Telemetry = (
  event: A2AV1TelemetryEvent,
  dimensions?: A2AV1TelemetryDimensions,
) => void

const SAFE_TEXT = /^[A-Za-z0-9_.:/-]{1,80}$/

/**
 * Emit an A2A event through the shared observability fan-out.
 *
 * The payload is constructed from a fixed allowlist. Identifiers, prompts,
 * model output, API material, account data, and caller metadata are not accepted.
 */
export const emitA2AV1Telemetry: A2AV1Telemetry = (event, dimensions = {}) => {
  try {
    const context = {
      environment: safeText(process.env.VERCEL_ENV || process.env.NODE_ENV) || 'unknown',
      route: '/api/v1/a2a',
      ...(safeText(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA)
        ? { deploymentRevision: safeText(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA) }
        : {}),
      ...(safeText(dimensions.method) ? { method: safeText(dimensions.method) } : {}),
      ...(safeText(dimensions.taskState) ? { taskState: safeText(dimensions.taskState) } : {}),
      ...(safeText(dimensions.resultClass) ? { resultClass: safeText(dimensions.resultClass) } : {}),
      ...(safeText(dimensions.errorClass) ? { errorClass: safeText(dimensions.errorClass) } : {}),
      ...(dimensions.scope ? { scope: dimensions.scope } : {}),
      ...(dimensions.eventKind ? { eventKind: dimensions.eventKind } : {}),
      ...safeNumber('eventSequence', dimensions.eventSequence),
      ...safeNumber('claimDelayMs', dimensions.claimDelayMs),
      ...safeNumber('durationMs', dimensions.durationMs),
    }
    if (ALERT_EVENTS.has(event)) {
      captureError(new Error(event), { event, ...context })
    } else if (SIGNAL_EVENTS.has(event)) {
      captureSignal(event, { event, ...context })
    } else {
      captureEvent(event, context)
      if (
        event === 'a2a.v1.task.claimed'
        && typeof dimensions.claimDelayMs === 'number'
        && dimensions.claimDelayMs >= CLAIM_DELAY_SIGNAL_MS
      ) {
        captureSignal('a2a.v1.task.claim_delayed', {
          event: 'a2a.v1.task.claim_delayed',
          ...context,
          thresholdMs: CLAIM_DELAY_SIGNAL_MS,
        })
      }
    }
  } catch {
    // Observability must never affect the protocol path.
  }
}

const ALERT_EVENTS = new Set<A2AV1TelemetryEvent>([
  'a2a.v1.event.persistence_failed',
  'a2a.v1.scheduled_execution.failed',
  'a2a.v1.task.reconciled',
  'a2a.v1.task.terminal_write_conflict',
])

const SIGNAL_EVENTS = new Set<A2AV1TelemetryEvent>([
  'a2a.v1.auth.denied',
  'a2a.v1.rate_limited',
])

const CLAIM_DELAY_SIGNAL_MS = 10_000

function safeText(value: string | undefined): string | undefined {
  return value && SAFE_TEXT.test(value) ? value : undefined
}

function safeNumber(
  key: 'eventSequence' | 'claimDelayMs' | 'durationMs',
  value: number | undefined,
): Partial<Record<typeof key, number>> {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? { [key]: value }
    : {}
}
