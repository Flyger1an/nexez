import { describe, expect, it } from 'vitest'
import { a2aStreamingEnabled } from './capabilities'

describe('a2aStreamingEnabled', () => {
  it.each(['1', 'true', 'TRUE', 'yes', 'on'])('enables streaming for %s', (value: string | undefined) => {
    expect(a2aStreamingEnabled({ A2A_STREAMING_ENABLED: value })).toBe(true)
  })

  it.each([undefined, '', '0', 'false', 'off'])('fails closed for %s', (value: string | undefined) => {
    expect(a2aStreamingEnabled({ A2A_STREAMING_ENABLED: value })).toBe(false)
  })
})
