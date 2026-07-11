import { describe, it, expect } from 'vitest'
import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../artifact-cors'

describe('artifact CORS helpers', () => {
  it('exposes a wildcard allow-origin for cross-origin GET', () => {
    expect(ARTIFACT_CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*')
  })

  it('artifactPreflight → 204 with GET/OPTIONS methods allowed', () => {
    const res = artifactPreflight()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
    expect(res.headers.get('access-control-allow-methods')).toContain('OPTIONS')
  })
})
