import { describe, it, expect, vi } from 'vitest'
import { parseNexieSse } from './nexie'

// Builds an OpenAI-style streaming chunk line.
const chunk = (delta: unknown) => `data: ${JSON.stringify({ choices: [{ delta }] })}`

describe('parseNexieSse', () => {
  it('concatenates content deltas and forwards each to onToken in order', () => {
    const tokens: string[] = []
    const sse = [chunk({ content: 'Found ' }), chunk({ content: 'two ' }), chunk({ content: 'matches.' }), 'data: [DONE]'].join('\n')
    const msg = parseNexieSse(sse, (t) => tokens.push(t))
    expect(tokens).toEqual(['Found ', 'two ', 'matches.'])
    expect(msg.content).toBe('Found two matches.')
    expect(msg.tool_calls).toBeUndefined()
  })

  it('reconstructs a tool call whose id/name and arguments arrive split across chunks', () => {
    const tokens: string[] = []
    const sse = [
      chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'search_pages', arguments: '' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"query":' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"running shoes"}' } }] }),
      'data: [DONE]',
    ].join('\n')
    const msg = parseNexieSse(sse, (t) => tokens.push(t))
    expect(tokens).toEqual([]) // pure tool call → no user-facing tokens
    expect(msg.content).toBeNull()
    expect(msg.tool_calls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'search_pages', arguments: '{"query":"running shoes"}' } },
    ])
  })

  it('keeps multiple parallel tool calls separate by index and ordered', () => {
    const sse = [
      chunk({ tool_calls: [{ index: 1, id: 'b', type: 'function', function: { name: 'trigger_booking', arguments: '{}' } }] }),
      chunk({ tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'search_pages', arguments: '{}' } }] }),
    ].join('\n')
    const msg = parseNexieSse(sse, () => {})
    expect(msg.tool_calls?.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('tolerates malformed/non-data lines without throwing', () => {
    const sse = [': keep-alive comment', 'data: {not json', '', chunk({ content: 'ok' }), 'data: [DONE]'].join('\n')
    const tokens: string[] = []
    const msg = parseNexieSse(sse, (t) => tokens.push(t))
    expect(msg.content).toBe('ok')
    expect(tokens).toEqual(['ok'])
  })
})
