import { beforeEach, describe, expect, it, vi } from 'vitest'

const { captureError, captureEvent } = vi.hoisted(() => ({
  captureError: vi.fn(),
  captureEvent: vi.fn(),
}))

vi.mock('../../observability', () => ({ captureError, captureEvent }))

import { emitA2AV1Telemetry } from './telemetry'

describe('A2A v1 telemetry', () => {
  beforeEach(() => {
    captureEvent.mockReset()
    captureError.mockReset()
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '4ec30dca3510c55fda337a75be95954fb2a55f27')
  })

  it('routes actionable invariant failures through the error alert fan-out', () => {
    emitA2AV1Telemetry('a2a.v1.event.persistence_failed', {
      errorClass: 'event_write_failed',
    })

    expect(captureEvent).not.toHaveBeenCalled()
    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'a2a.v1.event.persistence_failed' }),
      expect.objectContaining({
        event: 'a2a.v1.event.persistence_failed',
        errorClass: 'event_write_failed',
      }),
    )
  })

  it('emits only the bounded operational dimensions', () => {
    emitA2AV1Telemetry('a2a.v1.task.state_changed', {
      method: 'SendMessage',
      taskState: 'TASK_STATE_COMPLETED',
      resultClass: 'settled',
      eventSequence: 4,
      durationMs: 25,
    })

    expect(captureEvent).toHaveBeenCalledWith('a2a.v1.task.state_changed', {
      environment: 'production',
      route: '/api/v1/a2a',
      deploymentRevision: '4ec30dca3510c55fda337a75be95954fb2a55f27',
      method: 'SendMessage',
      taskState: 'TASK_STATE_COMPLETED',
      resultClass: 'settled',
      eventSequence: 4,
      durationMs: 25,
    })
  })

  it('drops unsafe text and invalid measurements', () => {
    emitA2AV1Telemetry('a2a.v1.request.failed', {
      errorClass: 'private provider response with spaces',
      claimDelayMs: -1,
    })

    expect(captureEvent).toHaveBeenCalledWith('a2a.v1.request.failed', {
      environment: 'production',
      route: '/api/v1/a2a',
      deploymentRevision: '4ec30dca3510c55fda337a75be95954fb2a55f27',
    })
  })
})
