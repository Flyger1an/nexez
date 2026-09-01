export const A2A_PROTOCOL_VERSION = '1.0' as const
export const A2A_ENDPOINT_PATH = '/api/a2a' as const
export const A2A_PROTOCOL_BINDING = 'JSONRPC' as const

/**
 * Code-owned deployment truth. Keep this false until the same reviewed
 * changeset adds and verifies the transport at A2A_ENDPOINT_PATH. This is not
 * environment-driven: configuration alone must never publish a dead protocol
 * endpoint.
 */
export const A2A_TRANSPORT_DEPLOYED = false
