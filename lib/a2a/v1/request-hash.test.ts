import { describe, expect, it } from 'vitest'
import { parseA2AV1SendMessageParams } from './protocol'
import { hashA2AV1Work } from './request-hash'

const message = {
  messageId: 'message-1',
  role: 'ROLE_USER',
  parts: [{ text: 'Find a cleaner in Dallas.' }],
}

describe('hashA2AV1Work', () => {
  it('ignores response preferences for idempotent retries', () => {
    const first = parseA2AV1SendMessageParams({
      message,
      configuration: { returnImmediately: true, historyLength: 1 },
    })
    const retry = parseA2AV1SendMessageParams({
      message,
      configuration: { returnImmediately: false, historyLength: 20 },
    })

    expect(hashA2AV1Work(first)).toBe(hashA2AV1Work(retry))
  })

  it('is stable across metadata key ordering', () => {
    const first = parseA2AV1SendMessageParams({
      message,
      metadata: { budget: 250, location: 'Dallas' },
    })
    const reordered = parseA2AV1SendMessageParams({
      message,
      metadata: { location: 'Dallas', budget: 250 },
    })

    expect(hashA2AV1Work(first)).toBe(hashA2AV1Work(reordered))
  })

  it('changes when work identity changes', () => {
    const first = parseA2AV1SendMessageParams({ message })
    const changed = parseA2AV1SendMessageParams({
      message: {
        ...message,
        parts: [{ text: 'Find a plumber in Dallas.' }],
      },
    })

    expect(hashA2AV1Work(first)).not.toBe(hashA2AV1Work(changed))
  })
})
