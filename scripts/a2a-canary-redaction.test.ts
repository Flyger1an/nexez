import { describe, expect, it } from 'vitest'
import {
  containsA2ACredentialMaterial,
  redactA2ACredentialMaterial,
} from './a2a-canary-redaction.mjs'

describe('A2A canary report redaction', () => {
  it('allows safe descriptions of the Bearer boundary', () => {
    expect(containsA2ACredentialMaterial(
      'Anonymous traffic received the bounded Bearer challenge.',
    )).toBe(false)
    expect(containsA2ACredentialMaterial(
      'Report contains operational results only.',
    )).toBe(false)
  })

  it('detects and redacts API keys and long Bearer values', () => {
    const apiKey = `nxz_live_${'a'.repeat(24)}`
    const bearer = `Bearer ${'b'.repeat(40)}`

    expect(containsA2ACredentialMaterial(apiKey)).toBe(true)
    expect(containsA2ACredentialMaterial(bearer)).toBe(true)
    expect(redactA2ACredentialMaterial(`${apiKey} ${bearer}`)).toBe(
      '[redacted-api-key] Bearer [redacted]',
    )
  })
})
