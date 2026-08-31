import { describe, expect, it } from 'vitest'
import {
  A2A_ERROR,
  A2AProtocolError,
  afterSequence,
  parseJsonRpcRequest,
  parseMessageSendParams,
  isFinalTaskState,
  requestHash,
} from './protocol'

const message = {
  kind: 'message',
  role: 'user',
  messageId: 'message-1',
  parts: [{ kind: 'text', text: 'Find a cleaner in Dallas.' }],
}

describe('A2A protocol parsing', () => {
  it('accepts a valid message/send request', () => {
    expect(parseJsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'message/send', params: {} }))
      .toMatchObject({ id: 1, method: 'message/send' })
    expect(parseMessageSendParams({ message })).toMatchObject({
      message: { messageId: 'message-1' },
      configuration: { blocking: false },
    })
  })

  it('rejects non-text input parts with the A2A content-type error', () => {
    expect(() => parseMessageSendParams({
      message: {
        ...message,
        parts: [{ kind: 'data', data: { approve: true } }],
      },
    })).toThrowError(expect.objectContaining({ code: A2A_ERROR.contentTypeNotSupported }))
  })

  it('rejects approval metadata instead of creating a remote execution path', () => {
    expect(() => parseMessageSendParams({
      message: { ...message, metadata: { approvalDecision: 'approved' } },
    })).toThrowError(expect.objectContaining({ code: A2A_ERROR.unsupported }))
  })

  it('binds messageId reuse to work identity but not response preferences', () => {
    const first = parseMessageSendParams({
      message,
      configuration: { blocking: false, historyLength: 1 },
    })
    const second = parseMessageSendParams({
      message,
      configuration: { blocking: true, historyLength: 20 },
    })
    expect(requestHash(first)).toBe(requestHash(second))

    const changed = parseMessageSendParams({
      message: { ...message, parts: [{ kind: 'text', text: 'Find a plumber.' }] },
    })
    expect(requestHash(first)).not.toBe(requestHash(changed))
  })

  it('rejects messages over the canonical Nexxi turn limit before persistence', () => {
    expect(() => parseMessageSendParams({
      message: { ...message, parts: [{ kind: 'text', text: 'x'.repeat(4001) }] },
    })).toThrowError(expect.objectContaining({ code: A2A_ERROR.invalidParams }))
  })

  it('treats auth-required as settled for blocking and streaming callers', () => {
    expect(isFinalTaskState('auth-required')).toBe(true)
  })

  it('parses resume cursors from Last-Event-ID or extension metadata', () => {
    expect(afterSequence('12')).toBe(12)
    expect(afterSequence(null, { 'nexez:afterSequence': 8 })).toBe(8)
    expect(() => afterSequence('-1')).toThrow(A2AProtocolError)
  })
})
