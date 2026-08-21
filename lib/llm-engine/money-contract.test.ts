import { describe, expect, it } from 'vitest'
import { ClaudeAdapter } from './ClaudeAdapter'
import { GeminiAdapter } from './GeminiAdapter'
import { GrokAdapter } from './GrokAdapter'
import { OpenAIAdapter } from './OpenAIAdapter'
import { requireCounterPriceCents } from './BaseLLMAdapter'

const adapters = [
  ['OpenAI', new OpenAIAdapter('test-key')],
  ['Grok', new GrokAdapter('test-key')],
  ['Claude', new ClaudeAdapter('test-key')],
  ['Gemini', new GeminiAdapter('test-key')],
] as const

describe('automated negotiation money contract', () => {
  it('accepts only safe integer app-minor units', () => {
    expect(requireCounterPriceCents(12_500)).toBe(12_500)
    expect(() => requireCounterPriceCents(125.5)).toThrow(/integer price_cents/i)
    expect(() => requireCounterPriceCents('12500')).toThrow(/integer price_cents/i)
    expect(() => requireCounterPriceCents(49)).toThrow(/at least 50/i)
  })

  it.each(adapters)('%s maps price_cents without multiplying or guessing', (_provider, adapter) => {
    const parse = (adapter as unknown as {
      parseFunctionCall(name: string, args: Record<string, unknown>): {
        action: string
        counter?: { priceCents?: number }
      }
    }).parseFunctionCall.bind(adapter)

    expect(parse('generate_counter_offer', {
      price_cents: 12_500,
      reasoning: 'Canonical counter.',
    })).toMatchObject({ action: 'counter', counter: { priceCents: 12_500 } })

    expect(() => parse('generate_counter_offer', {
      proposed_price: 125,
      reasoning: 'Ambiguous legacy output.',
    })).toThrow(/price_cents/i)
  })
})
