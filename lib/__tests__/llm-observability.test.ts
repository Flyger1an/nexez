import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { isLlmConfigured, llmComplete, llmCompleteDetailed, llmModel, llmProviderName } from '../llm'
import { isObservabilityConfigured, captureError } from '../observability'

describe('llm gating', () => {
  beforeEach(() => { delete process.env.LLM_API_KEY })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.LLM_API_KEY
    delete process.env.LLM_MODEL
    delete process.env.LLM_BASE_URL
  })

  it('reports unconfigured + returns null without a key', async () => {
    expect(isLlmConfigured()).toBe(false)
    expect(await llmComplete('hi')).toBeNull()
  })
  it('reports configured when key present + default model', () => {
    process.env.LLM_API_KEY = 'sk-test'
    expect(isLlmConfigured()).toBe(true)
    expect(llmModel()).toBe('gpt-4o-mini')
    process.env.LLM_MODEL = 'grok-2'
    expect(llmModel()).toBe('grok-2')
  })
  it('returns structured telemetry for successful completions', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    process.env.LLM_BASE_URL = 'https://llm.example.com/v1'
    process.env.LLM_MODEL = 'agent-draft-v1'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'structured answer' } }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    const result = await llmCompleteDetailed('hello')

    expect(result).toMatchObject({
      text: 'structured answer',
      status: 'ok',
      configured: true,
      attempted: true,
      ok: true,
      provider: 'llm.example.com',
      model: 'agent-draft-v1',
    })
    expect(llmProviderName()).toBe('llm.example.com')
  })
  it('returns safe telemetry for provider failures', async () => {
    process.env.LLM_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))

    const result = await llmCompleteDetailed('hello')

    expect(result).toMatchObject({
      text: null,
      status: 'http_error',
      configured: true,
      attempted: true,
      ok: false,
      httpStatus: 503,
    })
    expect(await llmComplete('hello')).toBeNull()
  })
})

describe('observability gating', () => {
  beforeEach(() => { delete process.env.OBSERVABILITY_WEBHOOK_URL })
  afterEach(() => { delete process.env.OBSERVABILITY_WEBHOOK_URL })

  it('is unconfigured without webhook + captureError never throws', () => {
    expect(isObservabilityConfigured()).toBe(false)
    expect(() => captureError(new Error('boom'), { test: true })).not.toThrow()
  })
  it('reports configured when webhook set', () => {
    process.env.OBSERVABILITY_WEBHOOK_URL = 'https://hooks.example.com/x'
    expect(isObservabilityConfigured()).toBe(true)
  })
})
