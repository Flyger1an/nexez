const API_KEY_PATTERN = /nxz_live_[A-Za-z0-9_-]{16,}/g
const BEARER_VALUE_PATTERN = /Bearer\s+(?:nxz_live_[A-Za-z0-9_-]+|[A-Za-z0-9._~+/-]{32,})/gi

export function containsA2ACredentialMaterial(value) {
  const text = String(value)
  API_KEY_PATTERN.lastIndex = 0
  BEARER_VALUE_PATTERN.lastIndex = 0
  return API_KEY_PATTERN.test(text) || BEARER_VALUE_PATTERN.test(text)
}

export function redactA2ACredentialMaterial(value) {
  return String(value)
    .replace(API_KEY_PATTERN, '[redacted-api-key]')
    .replace(BEARER_VALUE_PATTERN, 'Bearer [redacted]')
}
