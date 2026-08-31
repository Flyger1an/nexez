import { createHash } from 'crypto'
import type { A2AArtifact, A2APart, A2ATaskState } from './nexie-stream'

export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

export type JsonRpcSuccess<T> = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result: T
}

export type JsonRpcErrorBody = {
  code: number
  message: string
  data?: Record<string, unknown>
}

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  error: JsonRpcErrorBody
}

export type A2AMessage = {
  kind: 'message'
  role: 'user' | 'agent'
  messageId: string
  taskId?: string
  contextId?: string
  parts: A2APart[]
  metadata?: Record<string, unknown>
  extensions?: string[]
  referenceTaskIds?: string[]
}

export type A2ATaskStatus = {
  state: A2ATaskState
  message?: A2AMessage
  timestamp?: string
}

export type A2ATask = {
  kind: 'task'
  id: string
  contextId: string
  status: A2ATaskStatus
  history?: A2AMessage[]
  artifacts?: A2AArtifact[]
  metadata?: Record<string, unknown>
}

export type MessageSendConfiguration = {
  acceptedOutputModes?: string[]
  historyLength?: number
  blocking?: boolean
}

export type MessageSendParams = {
  message: A2AMessage
  configuration: MessageSendConfiguration
  metadata?: Record<string, unknown>
}

export type TaskQueryParams = {
  id: string
  historyLength?: number
  metadata?: Record<string, unknown>
}

export const A2A_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  server: -32000,
  taskNotFound: -32001,
  pushNotSupported: -32003,
  unsupported: -32004,
  contentTypeNotSupported: -32005,
  idempotencyConflict: -32010,
  taskBusy: -32011,
} as const

export class A2AProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: Record<string, unknown>,
    readonly httpStatus = 400,
  ) {
    super(message)
    this.name = 'A2AProtocolError'
  }
}

export function jsonRpcSuccess<T>(id: JsonRpcId, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: '2.0', id, result }
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: Record<string, unknown>,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  }
}

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (!isRecord(value) || value.jsonrpc !== '2.0' || typeof value.method !== 'string') {
    throw new A2AProtocolError(A2A_ERROR.invalidRequest, 'Invalid JSON-RPC Request')
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'id')) {
    throw new A2AProtocolError(
      A2A_ERROR.invalidRequest,
      'A2A requests require a JSON-RPC id.',
    )
  }

  const id = value.id
  if (!(id === null || typeof id === 'string' || typeof id === 'number')) {
    throw new A2AProtocolError(A2A_ERROR.invalidRequest, 'Invalid JSON-RPC id.')
  }
  if (typeof id === 'number' && !Number.isFinite(id)) {
    throw new A2AProtocolError(A2A_ERROR.invalidRequest, 'Invalid JSON-RPC id.')
  }

  const method = value.method.trim()
  if (!method) {
    throw new A2AProtocolError(A2A_ERROR.invalidRequest, 'JSON-RPC method is required.')
  }

  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(Object.prototype.hasOwnProperty.call(value, 'params') ? { params: value.params } : {}),
  }
}

export function parseMessageSendParams(value: unknown): MessageSendParams {
  if (!isRecord(value) || !isRecord(value.message)) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'params.message is required.')
  }

  const message = parseUserMessage(value.message)
  const configuration = parseSendConfiguration(value.configuration)
  const metadata = optionalRecord(value.metadata, 'params.metadata')
  rejectRemoteApprovalMetadata(message.metadata, 'message.metadata')
  rejectRemoteApprovalMetadata(metadata, 'params.metadata')

  return {
    message,
    configuration,
    ...(metadata ? { metadata } : {}),
  }
}

export function parseTaskQueryParams(value: unknown): TaskQueryParams {
  if (!isRecord(value) || typeof value.id !== 'string' || !isUuid(value.id)) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'params.id must be a task UUID.')
  }

  const historyLength = parseHistoryLength(value.historyLength)
  const metadata = optionalRecord(value.metadata, 'params.metadata')
  return {
    id: value.id,
    ...(historyLength === undefined ? {} : { historyLength }),
    ...(metadata ? { metadata } : {}),
  }
}

export function messageText(message: A2AMessage): string {
  const chunks: string[] = []
  for (const part of message.parts) {
    if (part.kind !== 'text') {
      throw new A2AProtocolError(
        A2A_ERROR.contentTypeNotSupported,
        'Nexxi A2A currently accepts text message parts only.',
      )
    }
    chunks.push(part.text)
  }
  const text = chunks.join('\n').trim()
  if (!text) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'The message must contain text.')
  }
  if (text.length > 4000) {
    throw new A2AProtocolError(
      A2A_ERROR.invalidParams,
      'The message must be 4000 characters or fewer.',
    )
  }
  return text
}

export function requestHash(params: MessageSendParams): string {
  const workIdentity = {
    message: params.message,
    metadata: params.metadata ?? null,
  }
  return createHash('sha256').update(stableJson(workIdentity)).digest('hex')
}

export function afterSequence(
  headerValue: string | null,
  metadata?: Record<string, unknown>,
): number {
  const metadataValue = metadata?.['nexez:afterSequence']
  const candidate = headerValue?.trim() || metadataValue
  if (candidate === undefined || candidate === null || candidate === '') return 0
  const parsed = typeof candidate === 'number' ? candidate : Number(candidate)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new A2AProtocolError(
      A2A_ERROR.invalidParams,
      'The event cursor must be a non-negative integer.',
    )
  }
  return parsed
}

export function isFinalTaskState(state: A2ATaskState): boolean {
  return [
    'completed',
    'canceled',
    'failed',
    'rejected',
    'input-required',
    'auth-required',
  ].includes(state)
}

function parseUserMessage(value: Record<string, unknown>): A2AMessage {
  if (value.kind !== 'message' || value.role !== 'user') {
    throw new A2AProtocolError(
      A2A_ERROR.invalidParams,
      'params.message must be a user Message with kind "message".',
    )
  }
  if (typeof value.messageId !== 'string' || !value.messageId.trim()) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'message.messageId is required.')
  }
  if (value.messageId.length > 200) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'message.messageId is too long.')
  }
  if (!Array.isArray(value.parts) || value.parts.length === 0 || value.parts.length > 20) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'message.parts must be a non-empty array.')
  }

  const parts: A2APart[] = value.parts.map((part, index) => {
    if (!isRecord(part) || part.kind !== 'text' || typeof part.text !== 'string') {
      throw new A2AProtocolError(
        A2A_ERROR.contentTypeNotSupported,
        `message.parts[${index}] is not a supported text part.`,
      )
    }
    const metadata = optionalRecord(part.metadata, `message.parts[${index}].metadata`)
    return {
      kind: 'text',
      text: part.text,
      ...(metadata ? { metadata } : {}),
    }
  })

  const taskId = optionalUuid(value.taskId, 'message.taskId')
  const contextId = optionalUuid(value.contextId, 'message.contextId')
  const metadata = optionalRecord(value.metadata, 'message.metadata')
  const extensions = optionalStringArray(value.extensions, 'message.extensions', 20)
  const referenceTaskIds = optionalUuidArray(value.referenceTaskIds, 'message.referenceTaskIds', 20)

  return {
    kind: 'message',
    role: 'user',
    messageId: value.messageId.trim(),
    parts,
    ...(taskId ? { taskId } : {}),
    ...(contextId ? { contextId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(extensions ? { extensions } : {}),
    ...(referenceTaskIds ? { referenceTaskIds } : {}),
  }
}

function parseSendConfiguration(value: unknown): MessageSendConfiguration {
  if (value === undefined || value === null) return { blocking: false }
  if (!isRecord(value)) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'params.configuration must be an object.')
  }
  if (value.pushNotificationConfig !== undefined) {
    throw new A2AProtocolError(
      A2A_ERROR.pushNotSupported,
      'Push Notification is not supported',
    )
  }

  let acceptedOutputModes: string[] | undefined
  if (value.acceptedOutputModes !== undefined) {
    acceptedOutputModes = optionalStringArray(
      value.acceptedOutputModes,
      'configuration.acceptedOutputModes',
      20,
    )
    const supported = new Set(['text/plain', 'application/json'])
    if (!acceptedOutputModes?.some((mode) => supported.has(mode.toLowerCase()))) {
      throw new A2AProtocolError(
        A2A_ERROR.contentTypeNotSupported,
        'Incompatible output content types.',
      )
    }
  }

  if (value.blocking !== undefined && typeof value.blocking !== 'boolean') {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, 'configuration.blocking must be boolean.')
  }

  const historyLength = parseHistoryLength(value.historyLength)
  return {
    ...(acceptedOutputModes ? { acceptedOutputModes } : {}),
    ...(historyLength === undefined ? {} : { historyLength }),
    blocking: value.blocking === true,
  }
}

function parseHistoryLength(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 50) {
    throw new A2AProtocolError(
      A2A_ERROR.invalidParams,
      'historyLength must be an integer between 0 and 50.',
    )
  }
  return value as number
}

function rejectRemoteApprovalMetadata(
  metadata: Record<string, unknown> | undefined,
  path: string,
): void {
  if (!metadata) return
  for (const key of Object.keys(metadata)) {
    const normalized = key.replace(/[^a-z]/gi, '').toLowerCase()
    if (
      normalized === 'approval' ||
      normalized === 'approvalid' ||
      normalized === 'approvaldecision' ||
      normalized === 'decision'
    ) {
      throw new A2AProtocolError(
        A2A_ERROR.unsupported,
        'Remote approval execution is not supported. Complete approvals in Nexxi.',
        { path: `${path}.${key}` },
      )
    }
  }
}

function optionalRecord(value: unknown, path: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, `${path} must be an object.`)
  }
  return value
}

function optionalUuid(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !isUuid(value)) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, `${path} must be a UUID.`)
  }
  return value
}

function optionalUuidArray(value: unknown, path: string, max: number): string[] | undefined {
  const values = optionalStringArray(value, path, max)
  if (!values) return undefined
  if (values.some((item) => !isUuid(item))) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, `${path} must contain UUIDs.`)
  }
  return values
}

function optionalStringArray(value: unknown, path: string, max: number): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string')) {
    throw new A2AProtocolError(A2A_ERROR.invalidParams, `${path} must be a string array.`)
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
