import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { isLlmConfigured, llmComplete, llmModel } from '../llm'
import { isObservabilityConfigured, captureError } from '../observability'

describe('llm gating', () => {
  beforeEach(() => { delete process.env.LLM_API_KEY })
  afterEach(() => { delete process.env.LLM_API_KEY; delete process.env.LLM_MODEL })

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
