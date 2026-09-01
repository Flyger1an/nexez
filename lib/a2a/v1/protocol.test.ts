import { describe, expect, it } from 'vitest'
import {
  A2A_V1_ERROR,
  A2AV1ProtocolError,
  jsonRpcError,
  parseA2AV1JsonRpcRequest,
  parseA2AV1SendMessageParams,
  parseA2AV1TaskQueryParams,
  requireA2AV1Version,
} from './protocol'

const message = {
  messageId: 'message-1',
  role: 'ROLE_USER',
  parts: [{ text: 'Find a cleaner in Dallas.' }],
}

function expectProtocolCode(run: () => unknown, code: number) {
  expect(run).toThrowError(expect.objectContaining({ code }))
}

describe('A2A v1 protocol boundary', () => {
  it('requires explicit v1 negotiation and treats a missing header as v0.3', () => {
    expect(requireA2AV1Version('1.0')).toBe('1.0')

    for (const value of [null, '', '0.3', '1.0.1', '2.0']) {
      expectProtocolCode(
        () => requireA2AV1Version(value),
        A2A_V1_ERROR.versionNotSupported,
      )
    }

    try {
      requireA2AV1Version(null)
    } catch (error) {
      expect(error).toMatchObject({
        code: A2A_V1_ERROR.versionNotSupported,
        data: [
          expect.objectContaining({
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'VERSION_NOT_SUPPORTED',
            metadata: expect.objectContaining({ requestedVersion: '0.3' }),
          }),
        ],
      })
    }
  })

  it('accepts PascalCase v1 methods and rejects retired v0.3 method names', () => {
    expect(parseA2AV1JsonRpcRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'SendMessage',
      params: { message },
    })).toMatchObject({ id: 1, method: 'SendMessage' })

    expectProtocolCode(
      () => parseA2AV1JsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
      }),
      A2A_V1_ERROR.methodNotFound,
    )
  })

  it('requires a correlatable JSON-RPC id and rejects unsafe numeric ids', () => {
    expectProtocolCode(
      () => parseA2AV1JsonRpcRequest({ jsonrpc: '2.0', method: 'GetTask' }),
      A2A_V1_ERROR.invalidRequest,
    )
    expectProtocolCode(
      () => parseA2AV1JsonRpcRequest({
        jsonrpc: '2.0', id: 1.5, method: 'GetTask',
      }),
      A2A_V1_ERROR.invalidRequest,
    )
    expectProtocolCode(
      () => parseA2AV1JsonRpcRequest({
        jsonrpc: '2.0', id: Number.MAX_SAFE_INTEGER + 1, method: 'GetTask',
      }),
      A2A_V1_ERROR.invalidRequest,
    )
  })

  it('returns canonical bounded text as part of parsing', () => {
    expect(parseA2AV1SendMessageParams({ message })).toMatchObject({
      message: { messageId: 'message-1', role: 'ROLE_USER' },
      configuration: { returnImmediately: false },
      text: 'Find a cleaner in Dallas.',
    })

    const exactLimit = parseA2AV1SendMessageParams({
      message: { ...message, parts: [{ text: 'x'.repeat(4_000) }] },
    })
    expect(exactLimit.text).toHaveLength(4_000)

    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message: { ...message, parts: [{ text: 'x'.repeat(4_001) }] },
      }),
      A2A_V1_ERROR.invalidParams,
    )
  })

  it('enforces required v1 message fields and text-only input', () => {
    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message: { ...message, role: 'user' },
      }),
      A2A_V1_ERROR.invalidParams,
    )
    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message: { ...message, messageId: '' },
      }),
      A2A_V1_ERROR.invalidParams,
    )
    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message: { ...message, parts: [{ data: { query: 'cleaner' } }] },
      }),
      A2A_V1_ERROR.contentTypeNotSupported,
    )
    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message: {
          ...message,
          parts: [{ text: 'hello', raw: 'aGVsbG8=' }],
        },
      }),
      A2A_V1_ERROR.contentTypeNotSupported,
    )
  })

  it('rejects remote approval decisions at every metadata depth', () => {
    const attempts = [
      { message: { ...message, metadata: { approvalDecision: 'approved' } } },
      { message, metadata: { commerce: { approval: true } } },
      {
        message: {
          ...message,
          parts: [{ text: 'Book it', metadata: { nested: [{ decision: 'approve' }] } }],
        },
      },
    ]

    for (const attempt of attempts) {
      expectProtocolCode(
        () => parseA2AV1SendMessageParams(attempt),
        A2A_V1_ERROR.unsupported,
      )
    }
  })

  it('uses v1 returnImmediately semantics and rejects ambiguous legacy controls', () => {
    expect(parseA2AV1SendMessageParams({
      message,
      configuration: {
        returnImmediately: true,
        historyLength: 4,
        acceptedOutputModes: ['TEXT/PLAIN', 'application/json'],
      },
    }).configuration).toEqual({
      returnImmediately: true,
      historyLength: 4,
      acceptedOutputModes: ['text/plain', 'application/json'],
    })

    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message,
        configuration: { blocking: true },
      }),
      A2A_V1_ERROR.invalidParams,
    )
    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message,
        configuration: { acceptedOutputModes: ['image/png'] },
      }),
      A2A_V1_ERROR.contentTypeNotSupported,
    )
    expectProtocolCode(
      () => parseA2AV1SendMessageParams({
        message,
        configuration: { taskPushNotificationConfig: { url: 'https://example.com' } },
      }),
      A2A_V1_ERROR.pushNotSupported,
    )
  })

  it('parses bounded task queries without imposing a UUID-only identifier policy', () => {
    expect(parseA2AV1TaskQueryParams({
      id: 'merchant-task-123',
      historyLength: 0,
    })).toEqual({
      id: 'merchant-task-123',
      historyLength: 0,
    })

    expectProtocolCode(
      () => parseA2AV1TaskQueryParams({ id: 'task-1', historyLength: 51 }),
      A2A_V1_ERROR.invalidParams,
    )
  })

  it('serializes protocol errors with v1 structured detail arrays', () => {
    const error = new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'Invalid parameters.',
      [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [] }],
    )

    expect(jsonRpcError('request-1', error)).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      error: {
        code: A2A_V1_ERROR.invalidParams,
        message: 'Invalid parameters.',
        data: [{
          '@type': 'type.googleapis.com/google.rpc.BadRequest',
          fieldViolations: [],
        }],
      },
    })
  })
})
