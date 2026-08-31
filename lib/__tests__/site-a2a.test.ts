import { describe, expect, it } from 'vitest'
import { AGENT_RUNTIME_HOST, canonicalHostFor } from '../site'

describe('A2A host routing', () => {
  it('keeps the public A2A endpoint on the isolated agent runtime host', () => {
    expect(canonicalHostFor('/api/a2a')).toBe(AGENT_RUNTIME_HOST)
    expect(canonicalHostFor('/api/a2a/')).toBe(AGENT_RUNTIME_HOST)
  })
})
