export const A2A_PROTOCOL_VERSION = '1.0' as const
export const A2A_ENDPOINT_PATH = '/api/v1/a2a' as const
export const A2A_PROTOCOL_BINDING = 'JSONRPC' as const

/**
 * Code-owned deployment truth. The public Agent Card is exposed only when the
 * matching transport is part of the same reviewed changeset and its exact-head
 * validation has passed.
 */
export const A2A_TRANSPORT_DEPLOYED = true
export const A2A_STREAMING_DEPLOYED = true
