export const A2A_V1_PROTOCOL_VERSION = '1.0' as const

export const A2A_V1_METHODS = [
  'SendMessage',
  'SendStreamingMessage',
  'GetTask',
  'ListTasks',
  'CancelTask',
  'SubscribeToTask',
  'CreateTaskPushNotificationConfig',
  'GetTaskPushNotificationConfig',
  'ListTaskPushNotificationConfigs',
  'DeleteTaskPushNotificationConfig',
  'GetExtendedAgentCard',
] as const

export type A2AV1Method = (typeof A2A_V1_METHODS)[number]
export type A2AV1JsonRpcId = string | number | null

export type A2AV1JsonRpcRequest = {
  jsonrpc: '2.0'
  id: A2AV1JsonRpcId
  method: A2AV1Method
  params?: unknown
}

export type A2AV1ErrorDetail = {
  '@type': string
  [key: string]: unknown
}

export type A2AV1JsonRpcError = {
  jsonrpc: '2.0'
  id: A2AV1JsonRpcId
  error: {
    code: number
    message: string
    data?: A2AV1ErrorDetail[]
  }
}

export type A2AV1TextPart = {
  text: string
  metadata?: Record<string, unknown>
  mediaType?: 'text/plain'
}

export type A2AV1UserMessage = {
  messageId: string
  contextId?: string
  taskId?: string
  role: 'ROLE_USER'
  parts: A2AV1TextPart[]
  metadata?: Record<string, unknown>
  extensions?: string[]
  referenceTaskIds?: string[]
}

export type A2AV1SendMessageConfiguration = {
  acceptedOutputModes?: string[]
  historyLength?: number
  returnImmediately: boolean
}

export type ParsedA2AV1SendMessageParams = {
  message: A2AV1UserMessage
  configuration: A2AV1SendMessageConfiguration
  metadata?: Record<string, unknown>
  /** Canonical, bounded text that is safe to pass to Nexxi. */
  text: string
}

export type A2AV1TaskQueryParams = {
  id: string
  historyLength?: number
}

export const A2A_V1_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  taskNotFound: -32001,
  taskNotCancelable: -32002,
  pushNotSupported: -32003,
  unsupported: -32004,
  contentTypeNotSupported: -32005,
  invalidAgentResponse: -32006,
  extendedCardNotConfigured: -32007,
  extensionSupportRequired: -32008,
  versionNotSupported: -32009,
} as const

const METHOD_SET = new Set<string>(A2A_V1_METHODS)
const SUPPORTED_OUTPUT_MODES = new Set(['text/plain', 'application/json'])
const PART_CONTENT_KEYS = ['text', 'raw', 'url', 'data'] as const
const MAX_MESSAGE_TEXT_LENGTH = 4_000
const MAX_MESSAGE_PARTS = 20
const MAX_IDENTIFIER_LENGTH = 200
const MAX_ARRAY_ITEMS = 20
const MAX_HISTORY_LENGTH = 50

export class A2AV1ProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: A2AV1ErrorDetail[],
    readonly httpStatus = 400,
  ) {
    super(message)
    this.name = 'A2AV1ProtocolError'
  }
}

export function jsonRpcError(
  id: A2AV1JsonRpcId,
  error: Pick<A2AV1ProtocolError, 'code' | 'message' | 'data'>,
): A2AV1JsonRpcError {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: error.code,
      message: error.message,
      ...(error.data ? { data: error.data } : {}),
    },
  }
}

/**
 * A missing A2A-Version header means v0.3 by specification. This v1 boundary
 * therefore rejects a missing header instead of silently interpreting a v0.3
 * request with v1 semantics.
 */
export function requireA2AV1Version(value: string | null): typeof A2A_V1_PROTOCOL_VERSION {
  const requestedVersion = value?.trim() || '0.3'
  if (requestedVersion !== A2A_V1_PROTOCOL_VERSION) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.versionNotSupported,
      'A2A protocol version is not supported.',
      [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'VERSION_NOT_SUPPORTED',
          domain: 'nexez.ai',
          metadata: {
            requestedVersion,
            supportedVersions: A2A_V1_PROTOCOL_VERSION,
          },
        },
      ],
    )
  }
  return A2A_V1_PROTOCOL_VERSION
}

export function parseA2AV1JsonRpcRequest(value: unknown): A2AV1JsonRpcRequest {
  if (!isRecord(value) || value.jsonrpc !== '2.0') {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidRequest,
      'Request payload validation error.',
    )
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'id')) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidRequest,
      'A2A requests require a JSON-RPC id.',
    )
  }

  const id = parseJsonRpcId(value.id)
  const method = parseA2AV1Method(value.method)
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(Object.prototype.hasOwnProperty.call(value, 'params') ? { params: value.params } : {}),
  }
}

export function parseA2AV1Method(value: unknown): A2AV1Method {
  if (typeof value !== 'string' || !value.trim()) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidRequest,
      'JSON-RPC method is required.',
    )
  }
  const method = value.trim()
  if (!METHOD_SET.has(method)) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.methodNotFound,
      'Method not found.',
    )
  }
  return method as A2AV1Method
}

/**
 * Parses and fully validates a v1 SendMessageRequest. The returned `text` has
 * already passed the canonical Nexxi input limit, so route code cannot forget
 * a second validation helper before persistence or execution.
 */
export function parseA2AV1SendMessageParams(value: unknown): ParsedA2AV1SendMessageParams {
  if (!isRecord(value) || !isRecord(value.message)) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'params.message is required.',
    )
  }

  const message = parseUserMessage(value.message)
  const configuration = parseSendConfiguration(value.configuration)
  const metadata = optionalRecord(value.metadata, 'params.metadata')
  rejectRemoteApprovalMetadata(metadata, 'params.metadata')
  const text = messageText(message)

  return {
    message,
    configuration,
    ...(metadata ? { metadata } : {}),
    text,
  }
}

export function parseA2AV1TaskQueryParams(value: unknown): A2AV1TaskQueryParams {
  if (!isRecord(value)) {
    throw new A2AV1ProtocolError(A2A_V1_ERROR.invalidParams, 'params must be an object.')
  }
  const id = requiredIdentifier(value.id, 'params.id')
  const historyLength = parseHistoryLength(value.historyLength)
  return {
    id,
    ...(historyLength === undefined ? {} : { historyLength }),
  }
}

export function messageText(message: A2AV1UserMessage): string {
  const text = message.parts.map((part) => part.text).join('\n').trim()
  if (!text) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'The message must contain text.',
    )
  }
  if (text.length > MAX_MESSAGE_TEXT_LENGTH) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      `The message must be ${MAX_MESSAGE_TEXT_LENGTH} characters or fewer.`,
    )
  }
  return text
}

function parseJsonRpcId(value: unknown): A2AV1JsonRpcId {
  if (value === null) return null
  if (typeof value === 'string') {
    if (!value || value.length > MAX_IDENTIFIER_LENGTH) {
      throw new A2AV1ProtocolError(A2A_V1_ERROR.invalidRequest, 'Invalid JSON-RPC id.')
    }
    return value
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  throw new A2AV1ProtocolError(A2A_V1_ERROR.invalidRequest, 'Invalid JSON-RPC id.')
}

function parseUserMessage(value: Record<string, unknown>): A2AV1UserMessage {
  const messageId = requiredIdentifier(value.messageId, 'message.messageId')
  if (value.role !== 'ROLE_USER') {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'message.role must be ROLE_USER.',
    )
  }
  if (
    !Array.isArray(value.parts) ||
    value.parts.length === 0 ||
    value.parts.length > MAX_MESSAGE_PARTS
  ) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      `message.parts must contain between 1 and ${MAX_MESSAGE_PARTS} parts.`,
    )
  }

  const parts = value.parts.map((part, index) => parseTextPart(part, index))
  const contextId = optionalIdentifier(value.contextId, 'message.contextId')
  const taskId = optionalIdentifier(value.taskId, 'message.taskId')
  const metadata = optionalRecord(value.metadata, 'message.metadata')
  rejectRemoteApprovalMetadata(metadata, 'message.metadata')
  const extensions = optionalUriArray(value.extensions, 'message.extensions')
  const referenceTaskIds = optionalIdentifierArray(
    value.referenceTaskIds,
    'message.referenceTaskIds',
  )

  return {
    messageId,
    ...(contextId ? { contextId } : {}),
    ...(taskId ? { taskId } : {}),
    role: 'ROLE_USER',
    parts,
    ...(metadata ? { metadata } : {}),
    ...(extensions ? { extensions } : {}),
    ...(referenceTaskIds ? { referenceTaskIds } : {}),
  }
}

function parseTextPart(value: unknown, index: number): A2AV1TextPart {
  const path = `message.parts[${index}]`
  if (!isRecord(value) || typeof value.text !== 'string') {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.contentTypeNotSupported,
      `${path} is not a supported text part.`,
    )
  }

  const contentKeys = PART_CONTENT_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  )
  if (contentKeys.length !== 1 || contentKeys[0] !== 'text') {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.contentTypeNotSupported,
      `${path} must contain text only.`,
    )
  }

  let mediaType: 'text/plain' | undefined
  if (value.mediaType !== undefined) {
    if (typeof value.mediaType !== 'string' || value.mediaType.trim().toLowerCase() !== 'text/plain') {
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.contentTypeNotSupported,
        `${path}.mediaType must be text/plain.`,
      )
    }
    mediaType = 'text/plain'
  }

  const metadata = optionalRecord(value.metadata, `${path}.metadata`)
  rejectRemoteApprovalMetadata(metadata, `${path}.metadata`)
  return {
    text: value.text,
    ...(metadata ? { metadata } : {}),
    ...(mediaType ? { mediaType } : {}),
  }
}

function parseSendConfiguration(value: unknown): A2AV1SendMessageConfiguration {
  if (value === undefined || value === null) return { returnImmediately: false }
  if (!isRecord(value)) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'params.configuration must be an object.',
    )
  }

  if (Object.prototype.hasOwnProperty.call(value, 'blocking')) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'configuration.blocking is not a v1 field; use returnImmediately.',
    )
  }
  if (
    value.taskPushNotificationConfig !== undefined ||
    value.pushNotificationConfig !== undefined
  ) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.pushNotSupported,
      'Push notifications are not supported.',
    )
  }

  let acceptedOutputModes: string[] | undefined
  if (value.acceptedOutputModes !== undefined) {
    const modes = requiredStringArray(
      value.acceptedOutputModes,
      'configuration.acceptedOutputModes',
      MAX_ARRAY_ITEMS,
    ).map((mode) => mode.toLowerCase())
    acceptedOutputModes = [...new Set(modes)]
    if (!acceptedOutputModes.some((mode) => SUPPORTED_OUTPUT_MODES.has(mode))) {
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.contentTypeNotSupported,
        'Incompatible output content types.',
      )
    }
  }

  if (
    value.returnImmediately !== undefined &&
    typeof value.returnImmediately !== 'boolean'
  ) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      'configuration.returnImmediately must be boolean.',
    )
  }
  const historyLength = parseHistoryLength(value.historyLength)

  return {
    ...(acceptedOutputModes ? { acceptedOutputModes } : {}),
    ...(historyLength === undefined ? {} : { historyLength }),
    returnImmediately: value.returnImmediately === true,
  }
}

function parseHistoryLength(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_HISTORY_LENGTH) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      `historyLength must be an integer between 0 and ${MAX_HISTORY_LENGTH}.`,
    )
  }
  return value as number
}

function rejectRemoteApprovalMetadata(
  value: unknown,
  path: string,
  seen = new WeakSet<object>(),
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      rejectRemoteApprovalMetadata(value[index], `${path}[${index}]`, seen)
    }
    return
  }
  if (!isRecord(value)) return
  if (seen.has(value)) return
  seen.add(value)

  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z]/gi, '').toLowerCase()
    if (
      normalized === 'approval' ||
      normalized === 'approvalid' ||
      normalized === 'approvaldecision' ||
      normalized === 'decision'
    ) {
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.unsupported,
        'Remote approval execution is not supported. Complete approvals in Nexxi.',
        [
          {
            '@type': 'type.googleapis.com/google.rpc.BadRequest',
            fieldViolations: [
              {
                field: `${path}.${key}`,
                description: 'Remote approval metadata is not accepted.',
              },
            ],
          },
        ],
      )
    }
    rejectRemoteApprovalMetadata(nested, `${path}.${key}`, seen)
  }
}

function requiredIdentifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new A2AV1ProtocolError(A2A_V1_ERROR.invalidParams, `${path} is required.`)
  }
  const identifier = value.trim()
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    throw new A2AV1ProtocolError(A2A_V1_ERROR.invalidParams, `${path} is too long.`)
  }
  return identifier
}

function optionalIdentifier(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requiredIdentifier(value, path)
}

function optionalIdentifierArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  const values = requiredStringArray(value, path, MAX_ARRAY_ITEMS)
  return values.map((item, index) => requiredIdentifier(item, `${path}[${index}]`))
}

function optionalUriArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  const values = requiredStringArray(value, path, MAX_ARRAY_ITEMS)
  for (let index = 0; index < values.length; index += 1) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(values[index]!)) {
      throw new A2AV1ProtocolError(
        A2A_V1_ERROR.invalidParams,
        `${path}[${index}] must be an absolute URI.`,
      )
    }
  }
  return values
}

function requiredStringArray(value: unknown, path: string, max: number): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > max ||
    value.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new A2AV1ProtocolError(
      A2A_V1_ERROR.invalidParams,
      `${path} must be a non-empty string array with at most ${max} items.`,
    )
  }
  return value.map((item) => (item as string).trim())
}

function optionalRecord(value: unknown, path: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    throw new A2AV1ProtocolError(A2A_V1_ERROR.invalidParams, `${path} must be an object.`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
