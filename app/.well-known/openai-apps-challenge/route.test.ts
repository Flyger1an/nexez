import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

describe('/.well-known/openai-apps-challenge', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('stays unavailable until OpenAI provides a verification token', async () => {
    vi.stubEnv('OPENAI_APPS_CHALLENGE', '')

    const response = GET()

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })

  it('returns only the configured token as uncached plain text', async () => {
    vi.stubEnv('OPENAI_APPS_CHALLENGE', '  openai-domain-token  ')

    const response = GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('openai-domain-token')
  })
})
