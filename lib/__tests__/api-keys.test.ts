import { describe, expect, it } from 'vitest'
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  parseBearer,
} from '../api-keys'

describe('hashApiKey', () => {
  it('is deterministic and trims', () => {
    expect(hashApiKey('nxz_live_abc')).toBe(hashApiKey('  nxz_live_abc  '))
  })
  it('produces a 64-char sha256 hex', () => {
    expect(hashApiKey('x')).toMatch(/^[0-9a-f]{64}$/)
  })
  it('differs per input', () => {
    expect(hashApiKey('a')).not.toBe(hashApiKey('b'))
  })
})

describe('generateApiKey', () => {
  it('produces a prefixed key whose hash matches', () => {
    const { raw, prefix, keyHash } = generateApiKey()
    expect(raw.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(raw.length).toBeGreaterThanOrEqual(API_KEY_PREFIX.length + 48)
    expect(prefix.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(prefix.length).toBe(API_KEY_PREFIX.length + 4)
    expect(keyHash).toBe(hashApiKey(raw))
  })
  it('is unique across calls', () => {
    expect(generateApiKey().raw).not.toBe(generateApiKey().raw)
  })
})

describe('parseBearer', () => {
  it('parses with and without the Bearer scheme', () => {
    const { raw } = generateApiKey()
    expect(parseBearer(`Bearer ${raw}`)).toBe(raw)
    expect(parseBearer(raw)).toBe(raw)
    expect(parseBearer(`bearer ${raw}`)).toBe(raw)
  })
  it('rejects non-Nexez or missing tokens', () => {
    expect(parseBearer(null)).toBeNull()
    expect(parseBearer('Bearer ghp_something')).toBeNull()
    expect(parseBearer('Bearer ')).toBeNull()
  })
})

describe('isValidApiKeyFormat', () => {
  it('accepts generated keys, rejects junk', () => {
    expect(isValidApiKeyFormat(generateApiKey().raw)).toBe(true)
    expect(isValidApiKeyFormat('nxz_live_short')).toBe(false)
    expect(isValidApiKeyFormat('not-a-key')).toBe(false)
    expect(isValidApiKeyFormat(null)).toBe(false)
  })
})
